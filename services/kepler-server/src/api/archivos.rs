//! Archivos: hallazgos propios para revisar y editar desde el Centro de Control,
//! sus fotos (vía Storage con el JWT del usuario) y el comparador de identidades.
//! Las ediciones van por `/v1/sync/subir`, como en el resto de apps.

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use kepler_core::TipoNotificacion;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use super::notificaciones::notificar;
use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

const LIMITE_MAX: i64 = 200;
/// Por debajo del umbral de Re-ID automático (0.78): parecidos para revisar a mano.
const UMBRAL_COMPARADOR: f64 = 0.6;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tipo {
    Objetos,
    Personas,
    PuntosInteres,
}

#[derive(Debug, Deserialize)]
pub struct Params {
    tipo: Tipo,
    /// Uuid de la misión, o `ninguna` para lo capturado fuera de misión.
    mision: Option<String>,
    /// Busca en nombre y descripción.
    q: Option<String>,
    limite: Option<i64>,
    antes: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct Pagina {
    items: Vec<Value>,
    hay_mas: bool,
}

/// `GET /v1/archivos?tipo=objetos|personas|puntos_interes&mision=&q=&limite=&antes=`
pub async fn listar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<Params>,
) -> ApiResult<Json<Pagina>> {
    let limite = p.limite.unwrap_or(60);
    if !(1..=LIMITE_MAX).contains(&limite) {
        return Err(ApiError::Invalido(format!("limite entre 1 y {LIMITE_MAX}")));
    }
    let (sin_mision, mision) = match p.mision.as_deref() {
        None | Some("") => (false, None),
        Some("ninguna") => (true, None),
        Some(id) => (
            false,
            Some(
                id.parse::<Uuid>()
                    .map_err(|_| ApiError::Invalido("mision: uuid o `ninguna`".into()))?,
            ),
        ),
    };
    // Tabla y columna de texto fijas por tipo (nunca de la entrada)
    let (tabla, descripcion) = match p.tipo {
        Tipo::Objetos => ("objetos", "descripcion"),
        Tipo::Personas => ("personas", "rasgos_fisicos"),
        Tipo::PuntosInteres => ("puntos_interes", "descripcion"),
    };
    let sql = format!(
        "select to_jsonb(t) - 'embedding' - 'posicion'
                || jsonb_build_object('tiene_embedding', t.embedding is not null)
         from public.{tabla} t
         where t.user_id = (select auth.uid()) and t.eliminado_en is null
           and ($1::uuid is null or t.mision_id = $1)
           and (not $2 or t.mision_id is null)
           and ($3::text is null or t.nombre ilike $3 or t.{descripcion} ilike $3)
           and ($4::timestamptz is null or t.capturado_en < $4)
         order by t.capturado_en desc
         limit $5"
    );
    let patron =
        p.q.map(|q| q.trim().replace(['%', '_'], ""))
            .filter(|q| !q.is_empty())
            .map(|q| format!("%{q}%"));
    let mut tx = estado.db.como_usuario(&sesion).await?;
    // tabla y columna salen del match de arriba, no de la petición
    let mut items: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(mision)
        .bind(sin_mision)
        .bind(patron)
        .bind(p.antes)
        .bind(limite + 1)
        .fetch_all(&mut *tx)
        .await?;
    tx.commit().await?;
    let hay_mas = items.len() as i64 > limite;
    items.truncate(limite as usize);
    Ok(Json(Pagina { items, hay_mas }))
}

/// `GET /v1/imagenes/{*ruta}` — foto de Storage (`capturas`) leída como el usuario:
/// la RLS de Storage decide qué puede ver.
pub async fn imagen(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(ruta): Path<String>,
) -> ApiResult<Response> {
    if ruta
        .split('/')
        .any(|parte| parte.is_empty() || parte == "..")
    {
        return Err(ApiError::Invalido("ruta inválida".into()));
    }
    let url = format!(
        "{}/object/authenticated/capturas/{ruta}",
        estado.config.storage_url.trim_end_matches('/')
    );
    let r = estado
        .http
        .get(url)
        .header("apikey", &estado.config.anon_key)
        .bearer_auth(&sesion.token)
        .send()
        .await
        .map_err(|e| ApiError::Interno(format!("Storage: {e}")))?;
    let estado_http = r.status();
    if estado_http == StatusCode::NOT_FOUND || estado_http == StatusCode::BAD_REQUEST {
        // Storage responde 400 "Object not found" también cuando la RLS lo oculta
        return Err(ApiError::NoEncontrado("imagen no encontrada"));
    }
    if !estado_http.is_success() {
        return Err(ApiError::Interno(format!("Storage {estado_http}")));
    }
    let tipo = r
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .unwrap_or(HeaderValue::from_static("image/jpeg"));
    let bytes = r
        .bytes()
        .await
        .map_err(|e| ApiError::Interno(format!("Storage: {e}")))?;
    Ok((
        [
            (header::CONTENT_TYPE, tipo),
            // Las fotos no cambian: el id está en la ruta
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=604800, immutable"),
            ),
        ],
        Body::from(bytes),
    )
        .into_response())
}

#[derive(Debug, Deserialize)]
pub struct ParamsPendientes {
    limite: Option<i64>,
}

/// `GET /v1/identidades/pendientes` — personas sueltas (sin identidad y sin
/// avistamientos vinculados) que se parecen a otras: para el comparador.
pub async fn pendientes(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<ParamsPendientes>,
) -> ApiResult<Json<Vec<Value>>> {
    let limite = p.limite.unwrap_or(30).clamp(1, 100);
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let filas: Vec<Value> = sqlx::query_scalar(
        "select jsonb_build_object(
                    'id', p.id, 'nombre', p.nombre, 'imagen_path', p.imagen_path,
                    'rasgos_fisicos', p.rasgos_fisicos, 'hostilidad', p.hostilidad,
                    'capturado_en', p.capturado_en, 'candidatos', c.lista)
         from public.personas p
         cross join lateral (
             select coalesce(jsonb_agg(c order by c.similitud desc), '[]') as lista
             from (
               select * from (
                 -- El mejor avistamiento de cada identidad
                 select distinct on (coalesce(q.identidad_id, q.id))
                        q.id, coalesce(r.nombre, q.nombre) as nombre, q.imagen_path,
                        q.capturado_en, coalesce(q.identidad_id, q.id) as identidad_id,
                        round((1 - (q.embedding operator(extensions.<=>) p.embedding))::numeric, 3)::float8 as similitud
                 from public.personas q
                 left join public.personas r on r.id = q.identidad_id
                 where q.id <> p.id and q.user_id = p.user_id
                   and q.eliminado_en is null and q.embedding is not null
                   and coalesce(q.identidad_id, q.id) <> p.id
                   and 1 - (q.embedding operator(extensions.<=>) p.embedding) >= $1
                 order by coalesce(q.identidad_id, q.id), q.embedding operator(extensions.<=>) p.embedding
               ) d
               order by d.similitud desc
               limit 5
             ) c
         ) c
         where p.user_id = (select auth.uid()) and p.eliminado_en is null
           and p.embedding is not null and p.identidad_id is null
           and not exists (select 1 from public.personas h
                           where h.identidad_id = p.id and h.eliminado_en is null)
           and jsonb_array_length(c.lista) > 0
         order by p.capturado_en desc
         limit $2",
    )
    .bind(UMBRAL_COMPARADOR)
    .bind(limite)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(filas))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Vincular {
    /// Otra persona (o su identidad): se usa la identidad raíz.
    con: Uuid,
}

/// `POST /v1/personas/{id}/vincular` — `{ "con": <uuid> }`. La persona (y sus
/// avistamientos) pasan a la identidad de `con`, con su nombre.
pub async fn vincular(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
    Json(v): Json<Vincular>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let raiz: Option<(Uuid, String)> = sqlx::query_as(
        "select r.id, r.nombre
         from public.personas q
         join public.personas r on r.id = coalesce(q.identidad_id, q.id)
         where q.id = $1 and q.eliminado_en is null and r.eliminado_en is null",
    )
    .bind(v.con)
    .fetch_optional(&mut *tx)
    .await?;
    let (identidad, nombre) = raiz.ok_or(ApiError::NoEncontrado("persona `con` no encontrada"))?;
    if identidad == id {
        return Err(ApiError::Invalido("ya es la misma identidad".into()));
    }
    let fila: Option<Value> = sqlx::query_scalar(
        "update public.personas set identidad_id = $2, nombre = $3
         where id = $1 and eliminado_en is null
         returning to_jsonb(personas) - 'embedding' - 'posicion'",
    )
    .bind(id)
    .bind(identidad)
    .bind(&nombre)
    .fetch_optional(&mut *tx)
    .await?;
    let fila = fila.ok_or(ApiError::NoEncontrado("persona no encontrada"))?;
    // Sus avistamientos la siguen
    sqlx::query(
        "update public.personas set identidad_id = $2, nombre = $3 where identidad_id = $1",
    )
    .bind(id)
    .bind(identidad)
    .bind(&nombre)
    .execute(&mut *tx)
    .await?;
    notificar(
        &mut tx,
        TipoNotificacion::Success,
        &format!("🔗 Identidad vinculada: «{nombre}»"),
        json!({ "origen": "comparador", "persona_id": id, "identidad_id": identidad }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(fila))
}

/// `POST /v1/personas/{id}/desvincular` — vuelve a ser una identidad propia.
pub async fn desvincular(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let fila: Option<Value> = sqlx::query_scalar(
        "update public.personas set identidad_id = null
         where id = $1 and eliminado_en is null
         returning to_jsonb(personas) - 'embedding' - 'posicion'",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    fila.map(Json)
        .ok_or(ApiError::NoEncontrado("persona no encontrada"))
}
