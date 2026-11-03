//! Preparación del explorador y rendimiento por misión (F8), a partir de la
//! biometría (reloj, iPhone, Apple Salud) y del perfil físico. Los cálculos
//! están en `kepler_core::fisiologia`; aquí solo se reúnen los datos.

use axum::Json;
use axum::extract::{Path, Query, State};
use chrono::{Duration, NaiveDate, Utc};
use kepler_core::fisiologia::{self, PerfilFisico, Pulsos, ResumenDia};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::Sesion;
use crate::db::Tx;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

/// Caracas, si el cliente no manda su desfase.
pub const DESFASE_POR_DEFECTO: i32 = -240;
/// Histéresis del desnivel: menos que esto es ruido del GPS o del barómetro.
const UMBRAL_DESNIVEL_M: f64 = 4.0;

fn desfase(d: Option<i32>) -> i32 {
    d.filter(|m| m.abs() <= 14 * 60)
        .unwrap_or(DESFASE_POR_DEFECTO)
}

fn hoy_local(desfase_min: i32) -> NaiveDate {
    (Utc::now() + Duration::minutes(i64::from(desfase_min))).date_naive()
}

/// Resumen por día local (sueño de la noche que termina ese día, pulso en
/// reposo, estrés, SpO2, ánimo, pasos y carga de misiones). Con dos fuentes
/// del mismo dato (reloj y Salud) se toma la mayor, no la suma.
pub async fn dias(
    tx: &mut Tx<'_>,
    desde: NaiveDate,
    hasta: NaiveDate,
    desfase_min: i32,
) -> Result<Vec<ResumenDia>, sqlx::Error> {
    let v: Value = sqlx::query_scalar(
        "with b as (
            select tipo, valor, fuente, detalle,
                   ((inicio at time zone 'utc') + make_interval(mins => $3))::date as dia,
                   ((fin at time zone 'utc') + make_interval(mins => $3) + interval '12 hours')::date as noche
            from public.biometria
            where fin >= ($1::date - 1)::timestamp at time zone 'utc' - make_interval(mins => $3)
              and inicio < ($2::date + 1)::timestamp at time zone 'utc' - make_interval(mins => $3)
         ),
         sueno as (
            select noche as dia, max(h) as sueno_h from (
                select noche, fuente, sum(valor) h from b
                where tipo = 'sueno' and coalesce(detalle->>'fase', 'dormido') not in ('despierto', 'en cama')
                group by noche, fuente) s
            group by noche
         ),
         pasos as (
            select dia, max(p) as pasos from (
                select dia, fuente, case when bool_or(tipo = 'pasos_hoy') then max(valor) filter (where tipo = 'pasos_hoy')
                                         else sum(valor) filter (where tipo = 'pasos') end p
                from b where tipo in ('pasos', 'pasos_hoy') group by dia, fuente) s
            group by dia
         ),
         resto as (
            select dia,
                   coalesce(avg(valor) filter (where tipo = 'pulso_reposo'),
                            case when count(*) filter (where tipo = 'pulso') >= 10
                                 then percentile_cont(0.1) within group (order by valor) filter (where tipo = 'pulso') end)
                       as pulso_reposo,
                   avg(valor) filter (where tipo = 'estres') as estres,
                   avg(valor) filter (where tipo = 'spo2') as spo2,
                   avg(case tipo when 'animo' then valor when 'animo_reloj' then (valor - 1.5) / 1.5 end) as animo
            from b group by dia
         ),
         carga as (
            select ((m.inicio_en at time zone 'utc') + make_interval(mins => $3))::date as dia,
                   sum(coalesce((r.metricas->>'trimp')::float8, 0)) as carga
            from public.rendimiento_mision r join public.misiones m on m.id = r.mision_id
            where m.eliminado_en is null group by 1
         ),
         todos as (
            select dia from sueno union select dia from pasos union select dia from resto union select dia from carga
         )
         select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'fecha', t.dia, 'sueno_h', round(s.sueno_h::numeric, 2), 'pulso_reposo', round(r.pulso_reposo::numeric, 1),
                    'estres', round(r.estres::numeric, 1), 'spo2', round(r.spo2::numeric, 1), 'animo', round(r.animo::numeric, 2),
                    'pasos', p.pasos, 'carga', round(coalesce(c.carga, 0)::numeric, 1))) order by t.dia), '[]')
         from todos t
         left join sueno s using (dia) left join pasos p using (dia) left join resto r using (dia) left join carga c using (dia)
         where t.dia between $1 and $2",
    )
    .bind(desde)
    .bind(hasta)
    .bind(desfase_min)
    .fetch_one(&mut **tx)
    .await?;
    Ok(serde_json::from_value(v).unwrap_or_default())
}

async fn perfil_fisico(tx: &mut Tx<'_>, user: Uuid) -> Result<PerfilFisico, sqlx::Error> {
    let v: Option<Value> = sqlx::query_scalar("select fisico from public.perfiles where id = $1")
        .bind(user)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(v.and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

/// Pulsos de referencia: perfil, pulso en reposo medido (mediana de 14 días)
/// y el máximo visto en misiones.
async fn pulsos(
    tx: &mut Tx<'_>,
    user: Uuid,
    perfil: &PerfilFisico,
    historial: &[ResumenDia],
) -> Result<Pulsos, sqlx::Error> {
    let mut reposo: Vec<f64> = historial
        .iter()
        .rev()
        .take(14)
        .filter_map(|d| d.pulso_reposo)
        .collect();
    reposo.sort_by(f64::total_cmp);
    let medido = (!reposo.is_empty()).then(|| reposo[reposo.len() / 2]);
    let observado: Option<f64> = sqlx::query_scalar(
        "select max((metricas->>'fc_max')::float8) from public.rendimiento_mision where user_id = $1",
    )
    .bind(user)
    .fetch_one(&mut **tx)
    .await?;
    Ok(perfil.pulsos(medido, observado))
}

/// Preparación para un día local con su historial.
async fn preparacion_en(
    tx: &mut Tx<'_>,
    dia: NaiveDate,
    desfase_min: i32,
) -> Result<(fisiologia::Preparacion, Vec<ResumenDia>), sqlx::Error> {
    let lista = dias(
        tx,
        dia - Duration::days(fisiologia::DIAS_BASE as i64),
        dia,
        desfase_min,
    )
    .await?;
    let hoy = lista
        .iter()
        .find(|d| d.fecha == dia)
        .cloned()
        .unwrap_or(ResumenDia {
            fecha: dia,
            ..Default::default()
        });
    Ok((fisiologia::preparacion(&hoy, &lista), lista))
}

/// Preparación de hoy, pulsos y zonas, y los últimos 14 días. También para Cortex.
pub async fn estado_fisico(
    tx: &mut Tx<'_>,
    user: Uuid,
    desfase_min: i32,
) -> Result<Value, sqlx::Error> {
    let hoy = hoy_local(desfase_min);
    let (prep, lista) = preparacion_en(tx, hoy, desfase_min).await?;
    let perfil = perfil_fisico(tx, user).await?;
    let p = pulsos(tx, user, &perfil, &lista).await?;
    let ultimos: Vec<&ResumenDia> = lista
        .iter()
        .filter(|d| (hoy - d.fecha).num_days() < 14)
        .collect();
    Ok(json!({
        "fecha": hoy,
        "preparacion": prep,
        "pulsos": { "maximo": p.maximo.round(), "reposo": p.reposo.round(), "maximo_estimado": p.maximo_estimado,
                    "zonas": p.limites() },
        "perfil": perfil,
        "dias": ultimos,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ParamsDesfase {
    desfase_min: Option<i32>,
}

/// `GET /v1/biometria/preparacion?desfase_min=`
pub async fn preparacion(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<ParamsDesfase>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let v = estado_fisico(&mut tx, sesion.user_id, desfase(p.desfase_min)).await?;
    tx.commit().await?;
    Ok(Json(v))
}

// --- rendimiento por misión -------------------------------------------------------

/// Inicio, fin, distancia (m) y duración (s) de una misión.
type FilaMision = (
    chrono::DateTime<Utc>,
    Option<chrono::DateTime<Utc>>,
    f64,
    i32,
);

/// Calcula (y guarda) las métricas de una misión iniciada. `None` si no existe
/// o no ha empezado.
pub async fn calcular(
    tx: &mut Tx<'_>,
    user: Uuid,
    mision: Uuid,
    desfase_min: i32,
) -> Result<Option<Value>, sqlx::Error> {
    let fila: Option<FilaMision> = sqlx::query_as(
        "select inicio_en, fin_en, distancia_m, duracion_s from public.misiones
         where id = $1 and eliminado_en is null and inicio_en is not null",
    )
    .bind(mision)
    .fetch_optional(&mut **tx)
    .await?;
    let Some((inicio, fin, distancia_m, duracion_s)) = fila else {
        return Ok(None);
    };
    let fin = fin.unwrap_or_else(Utc::now);
    // Sin rastro GPS la misión no tiene duración calculada: inicio → fin
    let duracion_s = if duracion_s > 0 {
        duracion_s
    } else {
        (fin - inicio).num_seconds().clamp(0, i64::from(i32::MAX)) as i32
    };

    let muestras = |tipo: &'static str| {
        sqlx::query_as::<_, (f64, f64)>(
            "select distinct on (inicio) extract(epoch from inicio)::float8, valor from public.biometria
             where tipo = $1 and inicio between $2 and $3 order by inicio",
        )
        .bind(tipo)
        .bind(inicio)
        .bind(fin)
    };
    let pulso = muestras("pulso").fetch_all(&mut **tx).await?;
    let spo2 = muestras("spo2").fetch_all(&mut **tx).await?;
    let barometro = muestras("altitud").fetch_all(&mut **tx).await?;
    let gps: Vec<Option<f64>> = sqlx::query_scalar(
        "select altitud from public.rastro_gps where mision_id = $1 order by registrado_en",
    )
    .bind(mision)
    .fetch_all(&mut **tx)
    .await?;
    // El barómetro del iPhone es más fino que la altitud GPS
    let (altitudes, fuente_altitud): (Vec<f64>, &str) = if barometro.len() >= 10 {
        (barometro.iter().map(|m| m.1).collect(), "barómetro")
    } else {
        (gps.into_iter().flatten().collect(), "gps")
    };
    let (sube, baja) = fisiologia::desnivel(&altitudes, UMBRAL_DESNIVEL_M);

    let dia = (inicio + Duration::minutes(i64::from(desfase_min))).date_naive();
    let (prep, lista) = preparacion_en(tx, dia, desfase_min).await?;
    let perfil = perfil_fisico(tx, user).await?;
    let p = pulsos(tx, user, &perfil, &lista).await?;
    let zonas = fisiologia::tiempo_por_zona(&pulso, &p);
    let fcs: Vec<f64> = pulso.iter().map(|m| m.1).collect();
    let media = |v: &[f64]| (!v.is_empty()).then(|| v.iter().sum::<f64>() / v.len() as f64);
    let r1 = |x: f64| (x * 10.0).round() / 10.0;
    let horas = f64::from(duracion_s.max(0)) / 3600.0;
    let metricas = json!({
        "distancia_km": r1(distancia_m / 1000.0),
        "duracion_min": (f64::from(duracion_s) / 60.0).round(),
        "velocidad_kmh": (horas > 0.0).then(|| r1(distancia_m / 1000.0 / horas)),
        "desnivel_pos_m": sube.round(),
        "desnivel_neg_m": baja.round(),
        "altitud_max_m": altitudes.iter().copied().reduce(f64::max).map(f64::round),
        "fuente_altitud": fuente_altitud,
        "muestras_pulso": fcs.len(),
        "fc_media": media(&fcs).map(f64::round),
        "fc_max": fcs.iter().copied().reduce(f64::max),
        "fc_min": fcs.iter().copied().reduce(f64::min),
        "zonas_min": zonas.map(|s| (s / 60.0).round()),
        // Lo mismo con nombre y rango, para leerlo sin ambigüedad (Cortex)
        "minutos_por_zona": (!fcs.is_empty()).then(|| minutos_por_zona(&zonas, &p)),
        "trimp": r1(fisiologia::trimp(&pulso, &p, perfil.sexo)),
        "spo2_min": spo2.iter().map(|m| m.1).reduce(f64::min),
        "spo2_media": media(&spo2.iter().map(|m| m.1).collect::<Vec<_>>()).map(r1),
        // Referencias personales para las zonas (no son de esta misión)
        "referencia_personal": (!fcs.is_empty()).then(|| json!({
            "fc_maxima_teorica": p.maximo.round(), "fc_reposo_habitual": p.reposo.round(),
            "fc_maxima_estimada_por_edad": p.maximo_estimado })),
        "preparacion": { "puntuacion": prep.puntuacion, "nivel": prep.nivel, "resumen": prep.resumen },
    });
    sqlx::query(
        "insert into public.rendimiento_mision (mision_id, user_id, metricas) values ($1, $2, $3)
         on conflict (mision_id) do update set metricas = excluded.metricas, calculado_en = now()",
    )
    .bind(mision)
    .bind(user)
    .bind(&metricas)
    .execute(&mut **tx)
    .await?;
    Ok(Some(metricas))
}

fn minutos_por_zona(zonas: &[f64; 6], p: &Pulsos) -> Value {
    let l = p.limites();
    let nombres = [
        format!("por debajo de zona 1 (<{} lpm)", l[0]),
        format!("zona 1 suave ({}-{} lpm)", l[0], l[1] - 1),
        format!("zona 2 aeróbica ({}-{} lpm)", l[1], l[2] - 1),
        format!("zona 3 moderada ({}-{} lpm)", l[2], l[3] - 1),
        format!("zona 4 intensa ({}-{} lpm)", l[3], l[4] - 1),
        format!("zona 5 máxima (≥{} lpm)", l[4]),
    ];
    Value::Object(
        nombres
            .into_iter()
            .zip(zonas)
            .map(|(n, s)| (n, json!((s / 60.0).round())))
            .collect(),
    )
}

/// Rendimiento guardado (con la valoración) tras recalcularlo.
async fn leer(tx: &mut Tx<'_>, user: Uuid, mision: Uuid, desfase_min: i32) -> ApiResult<Value> {
    calcular(tx, user, mision, desfase_min)
        .await?
        .ok_or(ApiError::NoEncontrado("misión no encontrada o sin empezar"))?;
    Ok(sqlx::query_scalar(
        "select jsonb_build_object('mision_id', r.mision_id, 'codigo', m.codigo, 'titulo', m.titulo, 'estado', m.estado,
                'inicio', m.inicio_en, 'fin', m.fin_en, 'metricas', r.metricas, 'esfuerzo', r.esfuerzo,
                'sensacion', r.sensacion, 'notas', r.notas, 'calculado_en', r.calculado_en)
         from public.rendimiento_mision r join public.misiones m on m.id = r.mision_id where r.mision_id = $1",
    )
    .bind(mision)
    .fetch_one(&mut **tx)
    .await?)
}

/// `GET /v1/misiones/{id}/rendimiento?desfase_min=` — se recalcula (puede haber
/// llegado biometría después de cerrar la misión).
pub async fn obtener(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
    Query(p): Query<ParamsDesfase>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let v = leer(&mut tx, sesion.user_id, id, desfase(p.desfase_min)).await?;
    tx.commit().await?;
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Valoracion {
    /// Esfuerzo percibido 1–10.
    esfuerzo: i16,
    sensacion: Option<String>,
    notas: Option<String>,
}

/// `POST /v1/misiones/{id}/valoracion` — esfuerzo percibido y sensación del explorador.
pub async fn valorar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
    Json(v): Json<Valoracion>,
) -> ApiResult<Json<Value>> {
    if !(1..=10).contains(&v.esfuerzo) {
        return Err(ApiError::Invalido("esfuerzo entre 1 y 10".into()));
    }
    let corto = |s: Option<String>, n: usize| {
        s.map(|s| s.trim().chars().take(n).collect::<String>())
            .filter(|s| !s.is_empty())
    };
    let mut tx = estado.db.como_usuario(&sesion).await?;
    calcular(&mut tx, sesion.user_id, id, DESFASE_POR_DEFECTO)
        .await?
        .ok_or(ApiError::NoEncontrado("misión no encontrada o sin empezar"))?;
    sqlx::query(
        "update public.rendimiento_mision set esfuerzo = $2, sensacion = $3, notas = $4, valorado_en = now()
         where mision_id = $1",
    )
    .bind(id)
    .bind(v.esfuerzo)
    .bind(corto(v.sensacion, 40))
    .bind(corto(v.notas, 1000))
    .execute(&mut *tx)
    .await?;
    let r = leer(&mut tx, sesion.user_id, id, DESFASE_POR_DEFECTO).await?;
    tx.commit().await?;
    Ok(Json(r))
}

#[derive(Debug, Deserialize)]
pub struct ParamsLista {
    limite: Option<i64>,
}

/// `GET /v1/rendimiento?limite=` — misiones con rendimiento, las más recientes primero.
pub async fn listar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<ParamsLista>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let v = lista(&mut tx, p.limite.unwrap_or(20).clamp(1, 100)).await?;
    tx.commit().await?;
    Ok(Json(json!({ "items": v })))
}

pub async fn lista(tx: &mut Tx<'_>, limite: i64) -> Result<Value, sqlx::Error> {
    sqlx::query_scalar(
        "select coalesce(jsonb_agg(x order by x->>'inicio' desc), '[]') from (
            select jsonb_build_object('mision_id', r.mision_id, 'codigo', m.codigo, 'titulo', m.titulo, 'estado', m.estado,
                   'inicio', m.inicio_en, 'metricas', r.metricas, 'esfuerzo', r.esfuerzo, 'sensacion', r.sensacion) x
            from public.rendimiento_mision r join public.misiones m on m.id = r.mision_id
            where m.eliminado_en is null order by m.inicio_en desc limit $1) s",
    )
    .bind(limite)
    .fetch_one(&mut **tx)
    .await
}
