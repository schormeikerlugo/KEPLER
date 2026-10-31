use axum::Json;
use axum::extract::{Query, State};
use chrono::{DateTime, Utc};
use kepler_core::TipoTerreno;
use kepler_core::explorador::{EstadoFisico, Recorrido, estado_fisico};
use serde::{Deserialize, Serialize};

use super::entorno::Disponible;
use crate::auth::Sesion;
use crate::error::ApiResult;
use crate::estado::Estado;
use crate::externo::Clima;

#[derive(Debug, Deserialize)]
pub struct Params {
    lat: Option<f64>,
    lng: Option<f64>,
}

/// Misión completada, tal como se lee para el cálculo.
#[derive(sqlx::FromRow)]
struct FilaRecorrido {
    distancia_m: f64,
    tipo_terreno: Option<String>,
    fin_en: DateTime<Utc>,
    multiplicador_fatiga: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct Explorador {
    #[serde(flatten)]
    fisico: EstadoFisico,
    misiones_completadas: usize,
    distancia_total_km: f64,
    calzado_reset_en: Option<DateTime<Utc>>,
    /// Solo si se pasan `lat` y `lng`.
    #[serde(skip_serializing_if = "Option::is_none")]
    clima: Option<Disponible<Clima>>,
}

/// `GET /v1/explorador?lat=&lng=` — desgaste del calzado, resistencia y clima actual.
pub async fn estado(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<Params>,
) -> ApiResult<Json<Explorador>> {
    let posicion = match (p.lat, p.lng) {
        (Some(lat), Some(lng)) => Some(kepler_core::Coordenada::new(lat, lng)?),
        (None, None) => None,
        _ => {
            return Err(crate::error::ApiError::Invalido(
                "lat y lng van juntas".into(),
            ));
        }
    };

    let mut tx = estado.db.como_usuario(&sesion).await?;
    let filas: Vec<FilaRecorrido> = sqlx::query_as(
        "select distancia_m, tipo_terreno, fin_en,
                (clima ->> 'multiplicador_fatiga')::float8 as multiplicador_fatiga
         from public.misiones
         where estado = 'completada' and eliminado_en is null and fin_en is not null",
    )
    .fetch_all(&mut *tx)
    .await?;
    let reset: Option<DateTime<Utc>> =
        sqlx::query_scalar("select calzado_reset_en from public.perfiles where id = $1")
            .bind(sesion.user_id)
            .fetch_optional(&mut *tx)
            .await?
            .flatten();
    tx.commit().await?;

    let recorridos: Vec<Recorrido> = filas
        .into_iter()
        .map(|f| Recorrido {
            distancia_km: f.distancia_m / 1000.0,
            terreno: f.tipo_terreno.and_then(|t| t.parse::<TipoTerreno>().ok()),
            fin: f.fin_en,
            clima: f.multiplicador_fatiga.unwrap_or(1.0),
        })
        .collect();

    let clima = match posicion {
        Some(c) => Some(estado.externos.clima(c.lat, c.lng).await.into()),
        None => None,
    };

    Ok(Json(Explorador {
        fisico: estado_fisico(&recorridos, reset, Utc::now()),
        misiones_completadas: recorridos.len(),
        distancia_total_km: (recorridos.iter().map(|r| r.distancia_km).sum::<f64>() * 10.0).round()
            / 10.0,
        calzado_reset_en: reset,
        clima,
    }))
}

/// `POST /v1/explorador/calzado` — calzado nuevo: el desgaste vuelve a 0.
pub async fn reset_calzado(
    State(estado): State<Estado>,
    sesion: Sesion,
) -> ApiResult<Json<serde_json::Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let ahora: DateTime<Utc> =
        sqlx::query_scalar("update public.perfiles set calzado_reset_en = now() where id = $1 returning calzado_reset_en")
            .bind(sesion.user_id)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(Json(serde_json::json!({ "calzado_reset_en": ahora })))
}
