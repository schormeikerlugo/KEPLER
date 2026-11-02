//! Biometría del explorador: muestras de Apple Salud, del barómetro del iPhone
//! y del reloj (ver la migración 0007).

use axum::Json;
use axum::extract::{Query, State};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::Sesion;
use crate::db::Tx;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

const MAX_POR_LOTE: usize = 2000;
const LIMITE_MAX: i64 = 5000;

/// Tipos que se suman (por día); el resto son mediciones puntuales.
pub const ACUMULABLES: &[&str] = &[
    "pasos",
    "distancia",
    "energia_activa",
    "energia_basal",
    "pisos",
    "consciencia",
];

#[derive(Debug, Deserialize)]
pub struct MuestraNueva {
    id: Uuid,
    tipo: String,
    valor: f64,
    unidad: String,
    inicio: DateTime<Utc>,
    fin: DateTime<Utc>,
    fuente: Option<String>,
    detalle: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct Guardadas {
    recibidas: usize,
    insertadas: u64,
}

/// `POST /v1/biometria` — lote de muestras; reenviar es seguro (idempotente por id).
pub async fn subir(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(muestras): Json<Vec<MuestraNueva>>,
) -> ApiResult<Json<Guardadas>> {
    if muestras.len() > MAX_POR_LOTE {
        return Err(ApiError::Invalido(format!(
            "máximo {MAX_POR_LOTE} muestras por lote"
        )));
    }
    for m in &muestras {
        let tipo_ok = (2..=32).contains(&m.tipo.len())
            && m.tipo
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
        if !tipo_ok || !m.valor.is_finite() || m.fin < m.inicio || m.unidad.len() > 16 {
            return Err(ApiError::Invalido(format!("muestra inválida: {}", m.id)));
        }
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let mut insertadas = 0;
    for m in &muestras {
        insertadas += sqlx::query(
            "insert into public.biometria (id, user_id, mision_id, tipo, valor, unidad, inicio, fin, fuente, detalle)
             values ($1, $2,
                     (select x.id from public.misiones x
                      where x.user_id = $2 and x.eliminado_en is null and x.inicio_en is not null
                        and x.inicio_en <= $7 and coalesce(x.fin_en, now()) >= $6
                      order by x.inicio_en desc limit 1),
                     $3, $4, $5, $6, $7, $8, $9)
             on conflict (id) do nothing",
        )
        .bind(m.id)
        .bind(sesion.user_id)
        .bind(&m.tipo)
        .bind(m.valor)
        .bind(&m.unidad)
        .bind(m.inicio)
        .bind(m.fin)
        .bind(m.fuente.as_deref().map(|f| f.chars().take(80).collect::<String>()))
        .bind(&m.detalle)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    }
    tx.commit().await?;
    Ok(Json(Guardadas {
        recibidas: muestras.len(),
        insertadas,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ParamsSerie {
    tipo: String,
    desde: Option<DateTime<Utc>>,
    hasta: Option<DateTime<Utc>>,
    mision: Option<Uuid>,
    limite: Option<i64>,
}

/// `GET /v1/biometria?tipo=&desde=&hasta=&mision=&limite=` — muestras, las más recientes primero.
pub async fn serie(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<ParamsSerie>,
) -> ApiResult<Json<Value>> {
    let limite = p.limite.unwrap_or(1000);
    if !(1..=LIMITE_MAX).contains(&limite) {
        return Err(ApiError::Invalido(format!("limite entre 1 y {LIMITE_MAX}")));
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let items: Value = sqlx::query_scalar(
        "select coalesce(jsonb_agg(to_jsonb(b) - 'user_id' order by b.inicio desc), '[]') from (
            select id, mision_id, tipo, valor, unidad, inicio, fin, fuente, detalle from public.biometria
            where tipo = $1 and ($2::timestamptz is null or fin >= $2) and ($3::timestamptz is null or inicio <= $3)
              and ($4::uuid is null or mision_id = $4)
            order by inicio desc limit $5) b",
    )
    .bind(&p.tipo)
    .bind(p.desde)
    .bind(p.hasta)
    .bind(p.mision)
    .bind(limite)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "items": items })))
}

#[derive(Debug, Deserialize)]
pub struct ParamsResumen {
    dias: Option<i64>,
    mision: Option<Uuid>,
}

/// `GET /v1/biometria/resumen?dias=7&mision=` — por tipo: último valor y
/// estadísticas (los acumulables, por día; el sueño, horas por noche).
pub async fn resumen(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<ParamsResumen>,
) -> ApiResult<Json<Value>> {
    let dias = p.dias.unwrap_or(7);
    if !(1..=365).contains(&dias) {
        return Err(ApiError::Invalido("dias entre 1 y 365".into()));
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let v = calcular_resumen(&mut tx, Utc::now() - Duration::days(dias), p.mision).await?;
    tx.commit().await?;
    Ok(Json(
        json!({ "dias": dias, "mision": p.mision, "tipos": v }),
    ))
}

/// Resumen por tipo desde una fecha (o de una misión). Lo usa también Cortex.
pub async fn calcular_resumen(
    tx: &mut Tx<'_>,
    desde: DateTime<Utc>,
    mision: Option<Uuid>,
) -> Result<Value, sqlx::Error> {
    sqlx::query_scalar(
        "with m as (
            select * from public.biometria
            where ($2::uuid is null and fin >= $1) or ($2::uuid is not null and mision_id = $2)
         ),
         ultimo as (
            select distinct on (tipo) tipo, valor, unidad, fin, fuente from m order by tipo, fin desc
         ),
         puntual as (
            select tipo, count(*) n, avg(valor) media, min(valor) minimo, max(valor) maximo
            from m where tipo <> all($3) and tipo <> 'sueno' group by tipo
         ),
         diario as (
            select tipo, count(*) n, avg(total) media, min(total) minimo, max(total) maximo,
                   max(total) filter (where dia = (now() at time zone 'utc')::date) hoy
            from (select tipo, (inicio at time zone 'utc')::date dia, sum(valor) total, count(*) c
                  from m where tipo = any($3) group by tipo, dia) d group by tipo
         ),
         noches as (
            -- Noche = fecha del despertar menos 12 h; solo fases dormido
            select 'sueno'::text tipo, count(*) n, avg(h) media, min(h) minimo, max(h) maximo,
                   (array_agg(h order by noche desc))[1] ultima_noche
            from (select ((fin - interval '12 hours') at time zone 'utc')::date noche, sum(valor) h
                  from m where tipo = 'sueno' and coalesce(detalle->>'fase', 'dormido') not in ('despierto', 'en cama')
                  group by noche) s
            having count(*) > 0
         )
         select coalesce(jsonb_object_agg(u.tipo, jsonb_strip_nulls(jsonb_build_object(
                    'unidad', u.unidad,
                    'ultimo', round((case when u.tipo = 'sueno' then s.ultima_noche else u.valor end)::numeric, 2), 'ultimo_en', u.fin, 'fuente', u.fuente,
                    'muestras', coalesce(p.n, d.n, s.n),
                    'media', round(coalesce(p.media, d.media, s.media)::numeric, 2),
                    'minimo', round(coalesce(p.minimo, d.minimo, s.minimo)::numeric, 2),
                    'maximo', round(coalesce(p.maximo, d.maximo, s.maximo)::numeric, 2),
                    'por_dia', d.tipo is not null,
                    'hoy', round(d.hoy::numeric, 2)))), '{}')
         from ultimo u
         left join puntual p using (tipo)
         left join diario d using (tipo)
         left join noches s using (tipo)",
    )
    .bind(desde)
    .bind(mision)
    .bind(ACUMULABLES)
    .fetch_one(&mut **tx)
    .await
}
