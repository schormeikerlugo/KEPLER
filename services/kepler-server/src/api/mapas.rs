//! Mapas vectoriales offline (PMTiles) servidos desde `KEPLER_MAPAS_DIR`.
//! Los archivos se sirven con soporte de `Range`, como necesita MapLibre.

use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

#[derive(Debug, Serialize)]
pub struct Region {
    id: String,
    nombre: String,
    tamano_mb: f64,
    url: String,
}

/// `GET /v1/mapas` — regiones disponibles para descargar o consultar.
pub async fn listar(State(estado): State<Estado>, _sesion: Sesion) -> ApiResult<Json<Vec<Region>>> {
    let dir = &estado.config.mapas_dir;
    let mut lectura = match tokio::fs::read_dir(dir).await {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Json(Vec::new())),
        Err(e) => return Err(ApiError::Interno(format!("{}: {e}", dir.display()))),
    };

    let mut regiones = Vec::new();
    while let Some(entrada) = lectura
        .next_entry()
        .await
        .map_err(|e| ApiError::Interno(e.to_string()))?
    {
        let nombre_archivo = entrada.file_name().to_string_lossy().into_owned();
        let Some(id) = nombre_archivo.strip_suffix(".pmtiles") else {
            continue;
        };
        let tamano = entrada.metadata().await.map(|m| m.len()).unwrap_or(0);
        regiones.push(Region {
            id: id.to_owned(),
            nombre: id.replace(['-', '_'], " "),
            tamano_mb: (tamano as f64 / 1_048_576.0 * 10.0).round() / 10.0,
            url: format!("/v1/mapas/archivos/{nombre_archivo}"),
        });
    }
    regiones.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(Json(regiones))
}
