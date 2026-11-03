use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use kepler_core::modelos::{Mision, PuntoRastro, ResumenRastro};
use kepler_core::{Coordenada, Dificultad, EstadoMision, TipoTerreno};
use kepler_proto::v1::{EventoMision, TipoEventoMision};
use kepler_proto::{Emisor, codificar, uuid_a_bytes};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::auth::Sesion;
use crate::db::{Tx, leer};
use crate::difusor::{Clase, Relevo};
use crate::error::{ApiError, ApiResult};
use crate::escritura;
use crate::estado::Estado;
use crate::tablas::Tabla;

#[derive(Debug, Deserialize)]
pub struct Filtro {
    estado: Option<EstadoMision>,
    limite: Option<i64>,
}

/// `GET /v1/misiones?estado=&limite=`
pub async fn listar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(f): Query<Filtro>,
) -> ApiResult<Json<Vec<Mision>>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let filas: Vec<Value> = sqlx::query_scalar(
        "select to_jsonb(m) from public.misiones m
         where eliminado_en is null and ($1::text is null or estado = $1)
         order by creado_en desc limit $2",
    )
    .bind(f.estado.map(|e| e.como_str()))
    .bind(f.limite.unwrap_or(50).clamp(1, 500))
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    let misiones = filas
        .into_iter()
        .map(serde_json::from_value)
        .collect::<Result<_, _>>()
        .map_err(|e| ApiError::Interno(e.to_string()))?;
    Ok(Json(misiones))
}

/// `GET /v1/misiones/{id}`
pub async fn obtener(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Mision>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let m = cargar(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(m))
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NuevaMision {
    /// Id generado en el dispositivo (opcional).
    id: Option<Uuid>,
    titulo: Option<String>,
    objetivo: Option<String>,
    ruta_id: Option<Uuid>,
    zona: Option<String>,
    tipo_terreno: Option<TipoTerreno>,
    dificultad: Option<Dificultad>,
    clima: Option<Value>,
    /// Despegar al crearla (Quick Launch).
    #[serde(default)]
    iniciar: bool,
    lat: Option<f64>,
    lng: Option<f64>,
    /// Cuándo ocurrió en el dispositivo (acciones guardadas sin conexión).
    en: Option<DateTime<Utc>>,
}

/// `POST /v1/misiones` — crea una misión (y opcionalmente la inicia).
pub async fn crear(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(n): Json<NuevaMision>,
) -> ApiResult<(StatusCode, Json<Mision>)> {
    let ahora = momento(n.en)?;
    let mut m = Mision::nueva(sesion.user_id, ahora);
    if let Some(id) = n.id {
        m.id = id;
    }
    m.titulo = n.titulo;
    m.objetivo = n.objetivo;
    m.ruta_id = n.ruta_id;
    m.zona = n.zona;
    m.tipo_terreno = n.tipo_terreno;
    m.dificultad = n.dificultad;
    if let Some(clima) = n.clima {
        m.clima = clima;
    }
    if n.iniciar {
        let inicio = coordenada(n.lat, n.lng)?;
        m.iniciar(ahora, inicio)?;
        m.meta.version = 1;
        if sin_clima(&m.clima) {
            m.clima = instantanea_clima(&estado, inicio).await;
        }
    }

    let mut tx = estado.db.como_usuario(&sesion).await?;
    m.codigo = codigo_libre(&mut tx, &m.codigo).await?;
    let fila = serde_json::to_value(&m)?;
    if !escritura::insertar(&estado.db, &mut tx, Tabla::Misiones, &fila).await? {
        return Err(ApiError::Conflicto(
            "ya existe una misión con ese id".into(),
        ));
    }
    let m = cargar(&mut tx, m.id).await?;
    tx.commit().await?;

    if n.iniciar {
        publicar_evento(&estado, &sesion, &m, TipoEventoMision::Iniciada);
    }
    // Zona, terreno y dificultad que falten, en segundo plano (prompt de la v0.7)
    if let (Some(lat), Some(lng)) = (m.lat_inicio, m.lng_inicio)
        && (m.zona.is_none() || m.tipo_terreno.is_none() || m.dificultad.is_none())
    {
        super::zona::completar_mision(estado.clone(), sesion.clone(), m.id, lat, lng);
    }
    Ok((StatusCode::CREATED, Json(m)))
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Inicio {
    lat: Option<f64>,
    lng: Option<f64>,
    en: Option<DateTime<Utc>>,
}

/// Cuerpo opcional de completar/abortar: la hora del dispositivo.
#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Momento {
    en: Option<DateTime<Utc>>,
}

/// Margen para la hora que manda el dispositivo: hasta 30 días atrás (una
/// misión larga sin cobertura) y 5 minutos adelante (reloj desajustado).
const ATRAS_MAX_DIAS: i64 = 30;
const ADELANTE_MAX_S: i64 = 300;

/// La hora de la acción: la del dispositivo si es razonable, si no, ahora.
fn momento(en: Option<DateTime<Utc>>) -> ApiResult<DateTime<Utc>> {
    let ahora = Utc::now();
    match en {
        None => Ok(ahora),
        Some(t) if t > ahora + chrono::Duration::seconds(ADELANTE_MAX_S) => {
            Err(ApiError::Invalido("en: hora en el futuro".into()))
        }
        Some(t) if t < ahora - chrono::Duration::days(ATRAS_MAX_DIAS) => Err(ApiError::Invalido(
            format!("en: más de {ATRAS_MAX_DIAS} días atrás"),
        )),
        Some(t) => Ok(t.min(ahora)),
    }
}

/// `POST /v1/misiones/{id}/iniciar`
pub async fn iniciar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
    cuerpo: Option<Json<Inicio>>,
) -> ApiResult<Json<Mision>> {
    let inicio = cuerpo.map(|Json(i)| i).unwrap_or_default();
    let en = momento(inicio.en)?;
    let coord = coordenada(inicio.lat, inicio.lng)?;
    let clima = instantanea_clima(&estado, coord).await;
    transicion(
        estado,
        sesion,
        id,
        en,
        TipoEventoMision::Iniciada,
        |m, ahora, _| {
            m.iniciar(ahora, coord)?;
            if sin_clima(&m.clima) {
                m.clima = clima;
            }
            Ok(())
        },
    )
    .await
}

/// `POST /v1/misiones/{id}/completar` — calcula el resumen desde el rastro GPS.
pub async fn completar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
    cuerpo: Option<Json<Option<Momento>>>,
) -> ApiResult<Json<Mision>> {
    let en = momento(cuerpo.and_then(|Json(m)| m).and_then(|m| m.en))?;
    let (estado2, sesion2) = (estado.clone(), sesion.clone());
    let r = transicion(
        estado,
        sesion,
        id,
        en,
        TipoEventoMision::Completada,
        |m, ahora, rastro| m.completar(ahora, &ResumenRastro::calcular(rastro)),
    )
    .await?;
    // Rendimiento de la misión (se recalcula si llega biometría más tarde)
    let calculo = async {
        let mut tx = estado2.db.como_usuario(&sesion2).await?;
        super::rendimiento::calcular(
            &mut tx,
            sesion2.user_id,
            id,
            super::rendimiento::DESFASE_POR_DEFECTO,
        )
        .await?;
        tx.commit().await?;
        Ok::<_, ApiError>(())
    };
    if let Err(e) = calculo.await {
        tracing::warn!(mision = %id, error = %e, "rendimiento: no se pudo calcular");
    }
    Ok(r)
}

/// `POST /v1/misiones/{id}/abortar`
pub async fn abortar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
    cuerpo: Option<Json<Option<Momento>>>,
) -> ApiResult<Json<Mision>> {
    let en = momento(cuerpo.and_then(|Json(m)| m).and_then(|m| m.en))?;
    transicion(
        estado,
        sesion,
        id,
        en,
        TipoEventoMision::Abortada,
        |m, ahora, _| m.abortar(ahora),
    )
    .await
}

async fn transicion(
    estado: Estado,
    sesion: Sesion,
    id: Uuid,
    en: DateTime<Utc>,
    evento: TipoEventoMision,
    aplicar: impl FnOnce(&mut Mision, DateTime<Utc>, &[PuntoRastro]) -> kepler_core::Resultado<()>,
) -> ApiResult<Json<Mision>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let mut m = cargar(&mut tx, id).await?;
    let version = m.meta.version;
    let rastro = if evento == TipoEventoMision::Completada {
        rastro_de(&mut tx, id).await?
    } else {
        Vec::new()
    };
    aplicar(&mut m, en, &rastro)?;

    // Concurrencia optimista: si otro dispositivo la cambió entretanto, 409.
    let cambiadas = sqlx::query(
        "update public.misiones set estado = $2, inicio_en = $3, fin_en = $4,
            lat_inicio = $5, lng_inicio = $6, distancia_m = $7, duracion_s = $8, vel_max_mps = $9,
            clima = $11
         where id = $1 and version = $10",
    )
    .bind(m.id)
    .bind(m.estado.como_str())
    .bind(m.inicio_en)
    .bind(m.fin_en)
    .bind(m.lat_inicio)
    .bind(m.lng_inicio)
    .bind(m.distancia_m)
    .bind(m.duracion_s)
    .bind(m.vel_max_mps)
    .bind(version)
    .bind(&m.clima)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if cambiadas == 0 {
        return Err(ApiError::Conflicto(
            "la misión cambió en otro dispositivo; recárgala".into(),
        ));
    }
    let m = cargar(&mut tx, id).await?;
    tx.commit().await?;
    publicar_evento(&estado, &sesion, &m, evento);
    Ok(Json(m))
}

/// `GET /v1/misiones/{id}/rastro`
pub async fn rastro(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Vec<PuntoRastro>>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    cargar(&mut tx, id).await?;
    let puntos = rastro_de(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(puntos))
}

/// Punto GPS tal como lo envía el dispositivo.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PuntoNuevo {
    pub id: Uuid,
    pub lat: f64,
    pub lng: f64,
    pub altitud: Option<f64>,
    pub velocidad: Option<f64>,
    pub rumbo: Option<f64>,
    pub precision_m: Option<f64>,
    pub registrado_en: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct RastroGuardado {
    recibidos: usize,
    insertados: u64,
}

const MAX_PUNTOS_POR_LOTE: usize = 1000;

/// `POST /v1/misiones/{id}/rastro` — lote de puntos; reenviar es seguro (idempotente por id).
pub async fn agregar_rastro(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
    Json(puntos): Json<Vec<PuntoNuevo>>,
) -> ApiResult<Json<RastroGuardado>> {
    if puntos.len() > MAX_PUNTOS_POR_LOTE {
        return Err(ApiError::Invalido(format!(
            "máximo {MAX_PUNTOS_POR_LOTE} puntos por lote"
        )));
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    cargar(&mut tx, id).await?;
    let mut insertados = 0;
    for p in &puntos {
        insertados += insertar_punto(&mut tx, sesion.user_id, id, p).await?;
    }
    tx.commit().await?;
    Ok(Json(RastroGuardado {
        recibidos: puntos.len(),
        insertados,
    }))
}

pub async fn insertar_punto(
    tx: &mut Tx<'_>,
    user_id: Uuid,
    mision_id: Uuid,
    p: &PuntoNuevo,
) -> ApiResult<u64> {
    Coordenada::new(p.lat, p.lng)?;
    Ok(sqlx::query(
        "insert into public.rastro_gps
            (id, user_id, mision_id, lat, lng, altitud, velocidad, rumbo, precision_m, registrado_en)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do nothing",
    )
    .bind(p.id)
    .bind(user_id)
    .bind(mision_id)
    .bind(p.lat)
    .bind(p.lng)
    .bind(p.altitud)
    .bind(p.velocidad)
    .bind(p.rumbo)
    .bind(p.precision_m)
    .bind(p.registrado_en)
    .execute(&mut **tx)
    .await?
    .rows_affected())
}

async fn cargar(tx: &mut Tx<'_>, id: Uuid) -> ApiResult<Mision> {
    leer::<Mision>(tx, Tabla::Misiones, id)
        .await?
        .filter(|m| !m.meta.esta_eliminado())
        .ok_or(ApiError::NoEncontrado("misión no encontrada"))
}

async fn rastro_de(tx: &mut Tx<'_>, mision_id: Uuid) -> ApiResult<Vec<PuntoRastro>> {
    let filas: Vec<Value> = sqlx::query_scalar(
        "select to_jsonb(r) from public.rastro_gps r where mision_id = $1 order by registrado_en",
    )
    .bind(mision_id)
    .fetch_all(&mut **tx)
    .await?;
    filas
        .into_iter()
        .map(|v| serde_json::from_value(v).map_err(|e| ApiError::Interno(e.to_string())))
        .collect()
}

/// `MISION-202610312005`, o `-2`, `-3`… si ya hay otra en el mismo minuto.
async fn codigo_libre(tx: &mut Tx<'_>, base: &str) -> ApiResult<String> {
    let usados: i64 = sqlx::query_scalar(
        "select count(*) from public.misiones where codigo = $1 or codigo like $1 || '-%'",
    )
    .bind(base)
    .fetch_one(&mut **tx)
    .await?;
    Ok(if usados == 0 {
        base.to_owned()
    } else {
        format!("{base}-{}", usados + 1)
    })
}

fn coordenada(lat: Option<f64>, lng: Option<f64>) -> ApiResult<Option<Coordenada>> {
    match (lat, lng) {
        (Some(lat), Some(lng)) => Ok(Some(Coordenada::new(lat, lng)?)),
        (None, None) => Ok(None),
        _ => Err(ApiError::Invalido("lat y lng van juntas".into())),
    }
}

fn sin_clima(clima: &Value) -> bool {
    clima.as_object().is_none_or(|o| o.is_empty())
}

/// Clima al despegar (incluye `multiplicador_fatiga`, que usa el estado del
/// explorador). Vacío si no hay coordenadas o el servicio no responde.
async fn instantanea_clima(estado: &Estado, inicio: Option<Coordenada>) -> Value {
    let Some(c) = inicio else {
        return Value::Object(Default::default());
    };
    match estado.externos.clima(c.lat, c.lng).await {
        Ok(clima) => serde_json::to_value(clima).unwrap_or_default(),
        Err(_) => Value::Object(Default::default()),
    }
}

fn publicar_evento(estado: &Estado, sesion: &Sesion, m: &Mision, tipo: TipoEventoMision) {
    let evento = EventoMision {
        mision_id: uuid_a_bytes(m.id),
        tipo: tipo.into(),
        codigo: m.codigo.clone(),
    };
    let envoltura = Emisor::default().envolver(evento, Utc::now().timestamp_millis());
    estado.difusor.publicar(
        sesion.user_id,
        Relevo {
            origen: None,
            clase: Clase::Otro,
            bytes: codificar(&envoltura),
        },
    );
}
