use std::net::SocketAddr;

use axum::Json;
use axum::extract::{ConnectInfo, Query, State};
use kepler_core::Coordenada;
use serde::{Deserialize, Serialize};

use crate::auth::Sesion;
use crate::error::ApiResult;
use crate::estado::Estado;

#[derive(Debug, Deserialize)]
pub struct Posicion {
    pub lat: f64,
    pub lng: f64,
}

impl Posicion {
    pub fn validar(&self) -> ApiResult<Coordenada> {
        Ok(Coordenada::new(self.lat, self.lng)?)
    }
}

/// Respuesta de un servicio externo: datos o motivo de que no estén.
/// Nunca se inventan valores por defecto si el servicio falla.
#[derive(Debug, Serialize)]
pub struct Disponible<T: Serialize> {
    pub disponible: bool,
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub datos: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motivo: Option<String>,
}

impl<T: Serialize> From<Result<T, String>> for Disponible<T> {
    fn from(r: Result<T, String>) -> Self {
        match r {
            Ok(datos) => Self {
                disponible: true,
                datos: Some(datos),
                motivo: None,
            },
            Err(motivo) => {
                tracing::warn!(%motivo, "servicio externo no disponible");
                Self {
                    disponible: false,
                    datos: None,
                    motivo: Some(motivo),
                }
            }
        }
    }
}

/// `GET /v1/clima?lat=&lng=`
pub async fn clima(
    State(estado): State<Estado>,
    _sesion: Sesion,
    Query(p): Query<Posicion>,
) -> ApiResult<Json<Disponible<crate::externo::Clima>>> {
    let c = p.validar()?;
    Ok(Json(estado.externos.clima(c.lat, c.lng).await.into()))
}

/// `GET /v1/aire?lat=&lng=`
pub async fn aire(
    State(estado): State<Estado>,
    _sesion: Sesion,
    Query(p): Query<Posicion>,
) -> ApiResult<Json<Disponible<crate::externo::Aire>>> {
    let c = p.validar()?;
    Ok(Json(estado.externos.aire(c.lat, c.lng).await.into()))
}

/// `GET /v1/geo/ip` — ubicación aproximada cuando no hay GPS.
pub async fn ubicacion_ip(
    State(estado): State<Estado>,
    _sesion: Sesion,
    ConnectInfo(cliente): ConnectInfo<SocketAddr>,
) -> Json<Disponible<crate::externo::UbicacionIp>> {
    Json(estado.externos.ubicacion_ip(cliente.ip()).await.into())
}
