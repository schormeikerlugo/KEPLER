//! Inicio de sesión por nombre de usuario.
//!
//! Las apps solo conocen la URL de `kepler-server`: el servidor traduce el usuario
//! a `<usuario>@kepler.local` y reenvía las credenciales a Auth (GoTrue) por la red
//! interna. No guarda nada ni usa claves de servicio.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use kepler_core::NombreUsuario;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

#[derive(Debug, Deserialize)]
pub struct Credenciales {
    usuario: String,
    contrasena: String,
}

#[derive(Debug, Deserialize)]
pub struct Renovar {
    refresh_token: String,
}

#[derive(Debug, Serialize)]
pub struct Tokens {
    access_token: String,
    refresh_token: String,
    /// Segundos de validez del `access_token`.
    expires_in: i64,
    usuario: String,
}

/// `POST /v1/sesion` — `{ "usuario", "contrasena" }`.
pub async fn entrar(
    State(estado): State<Estado>,
    Json(c): Json<Credenciales>,
) -> ApiResult<Json<Tokens>> {
    let usuario = NombreUsuario::desde_entrada(&c.usuario)
        .map_err(|_| ApiError::NoAutorizado("usuario o contraseña incorrectos"))?;
    let cuerpo = json!({ "email": usuario.email_interno(), "password": c.contrasena });
    pedir_tokens(&estado, "password", cuerpo).await.map(Json)
}

/// `POST /v1/sesion/renovar` — `{ "refresh_token" }`.
pub async fn renovar(
    State(estado): State<Estado>,
    Json(r): Json<Renovar>,
) -> ApiResult<Json<Tokens>> {
    let cuerpo = json!({ "refresh_token": r.refresh_token });
    pedir_tokens(&estado, "refresh_token", cuerpo)
        .await
        .map(Json)
}

/// `POST /v1/sesion/cerrar` — revoca los refresh tokens de esta sesión.
pub async fn cerrar(State(estado): State<Estado>, sesion: Sesion) -> ApiResult<StatusCode> {
    estado
        .http
        .post(format!("{}/logout", auth_url(&estado)))
        .header("apikey", &estado.config.anon_key)
        .bearer_auth(&sesion.token)
        .send()
        .await
        .map_err(|e| ApiError::Interno(format!("Auth: {e}")))?;
    Ok(StatusCode::NO_CONTENT)
}

fn auth_url(estado: &Estado) -> &str {
    estado.config.auth_url.trim_end_matches('/')
}

async fn pedir_tokens(estado: &Estado, tipo: &str, cuerpo: Value) -> ApiResult<Tokens> {
    let r = estado
        .http
        .post(format!("{}/token?grant_type={tipo}", auth_url(estado)))
        .header("apikey", &estado.config.anon_key)
        .json(&cuerpo)
        .send()
        .await
        .map_err(|e| ApiError::Interno(format!("Auth: {e}")))?;
    let http = r.status();
    let v: Value = r.json().await.unwrap_or_default();
    if http.is_client_error() {
        return Err(ApiError::NoAutorizado(if tipo == "password" {
            "usuario o contraseña incorrectos"
        } else {
            "sesión caducada"
        }));
    }
    if !http.is_success() {
        return Err(ApiError::Interno(format!("Auth {http}: {v}")));
    }
    let texto = |k: &str| v[k].as_str().map(str::to_owned);
    let usuario = v["user"]["email"]
        .as_str()
        .and_then(|e| NombreUsuario::desde_email_interno(e).ok())
        .map(String::from);
    match (texto("access_token"), texto("refresh_token"), usuario) {
        (Some(access_token), Some(refresh_token), Some(usuario)) => Ok(Tokens {
            access_token,
            refresh_token,
            expires_in: v["expires_in"].as_i64().unwrap_or(3600),
            usuario,
        }),
        _ => Err(ApiError::Interno(format!(
            "respuesta de Auth inesperada: {v}"
        ))),
    }
}
