use axum::Json;
use axum::extract::State;
use kepler_core::modelos::Perfil;
use serde::Deserialize;
use serde_json::Value;

use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

const SQL_PERFIL: &str = "select to_jsonb(p) from public.perfiles p where id = $1";

/// `GET /v1/yo`
pub async fn obtener(State(estado): State<Estado>, sesion: Sesion) -> ApiResult<Json<Perfil>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let fila: Option<Value> = sqlx::query_scalar(SQL_PERFIL)
        .bind(sesion.user_id)
        .fetch_optional(&mut *tx)
        .await?;
    tx.commit().await?;
    let fila = fila.ok_or(ApiError::NoEncontrado("perfil no encontrado"))?;
    Ok(Json(
        serde_json::from_value(fila).map_err(|e| ApiError::Interno(e.to_string()))?,
    ))
}

/// Campos que el explorador puede cambiar de su perfil.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CambiosPerfil {
    nombre_visible: Option<String>,
    avatar_path: Option<String>,
    avatar_ia: Option<String>,
    bio: Option<String>,
    ubicacion: Option<String>,
    preferencias: Option<Value>,
    fisico: Option<kepler_core::fisiologia::PerfilFisico>,
}

/// `PATCH /v1/yo` — solo se actualizan los campos presentes.
pub async fn actualizar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(c): Json<CambiosPerfil>,
) -> ApiResult<Json<Perfil>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    sqlx::query(
        "update public.perfiles set
            nombre_visible = coalesce($2, nombre_visible),
            avatar_path    = coalesce($3, avatar_path),
            avatar_ia      = coalesce($4, avatar_ia),
            bio            = coalesce($5, bio),
            ubicacion      = coalesce($6, ubicacion),
            preferencias   = coalesce($7, preferencias),
            fisico         = coalesce($8, fisico)
         where id = $1",
    )
    .bind(sesion.user_id)
    .bind(c.nombre_visible)
    .bind(c.avatar_path)
    .bind(c.avatar_ia)
    .bind(c.bio)
    .bind(c.ubicacion)
    .bind(c.preferencias)
    .bind(
        c.fisico
            .map(|f| serde_json::to_value(f).unwrap_or_default()),
    )
    .execute(&mut *tx)
    .await?;
    let fila: Value = sqlx::query_scalar(SQL_PERFIL)
        .bind(sesion.user_id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        serde_json::from_value(fila).map_err(|e| ApiError::Interno(e.to_string()))?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Avatar {
    /// JPEG en base64 (máx. 2 MB).
    imagen: String,
}

/// `POST /v1/yo/avatar` — sube la foto de perfil a Storage y la asigna.
pub async fn subir_avatar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(a): Json<Avatar>,
) -> ApiResult<Json<Perfil>> {
    use base64::Engine;
    let jpeg = base64::engine::general_purpose::STANDARD
        .decode(
            a.imagen
                .trim()
                .trim_start_matches("data:image/jpeg;base64,"),
        )
        .map_err(|e| ApiError::Invalido(format!("imagen: base64 inválido ({e})")))?;
    if jpeg.len() > 2 * 1024 * 1024 || !jpeg.starts_with(&[0xFF, 0xD8]) {
        return Err(ApiError::Invalido("imagen: JPEG de hasta 2 MB".into()));
    }
    let ruta = format!("{}/avatar/{}.jpg", sesion.user_id, kepler_core::nuevo_id());
    super::capturas::subir_imagen(&estado, &sesion, &ruta, jpeg)
        .await
        .map_err(ApiError::Interno)?;
    let mut tx = estado.db.como_usuario(&sesion).await?;
    sqlx::query("update public.perfiles set avatar_path = $2 where id = $1")
        .bind(sesion.user_id)
        .bind(&ruta)
        .execute(&mut *tx)
        .await?;
    let fila: Value = sqlx::query_scalar(SQL_PERFIL)
        .bind(sesion.user_id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        serde_json::from_value(fila).map_err(|e| ApiError::Interno(e.to_string()))?,
    ))
}
