//! Inteligencia de rutas (PostGIS): qué hay a lo largo de un trazado o
//! alrededor del explorador, y cuánto riesgo supone. Respeta RLS: solo se
//! consideran los hallazgos propios.

use axum::Json;
use axum::extract::{Query, State};
use kepler_core::riesgo::{Evaluacion, Peligro, evaluar};
use kepler_core::{Coordenada, Hostilidad, NivelRiesgo, Seguridad};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::Sesion;
use crate::db::Tx;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

const MAX_WAYPOINTS: usize = 5000;
const MAX_RADIO_M: f64 = 5000.0;
const MAX_RESULTADOS: i64 = 200;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Trazado {
    /// `[[lat, lng], ...]`, como `rutas.waypoints`.
    waypoints: Vec<[f64; 2]>,
    /// Ancho del corredor a cada lado, en metros.
    #[serde(default = "corredor_por_defecto")]
    corredor_m: f64,
}

fn corredor_por_defecto() -> f64 {
    200.0
}

#[derive(Debug, Deserialize)]
pub struct Cercania {
    lat: f64,
    lng: f64,
    #[serde(default = "radio_por_defecto")]
    radio_m: f64,
}

fn radio_por_defecto() -> f64 {
    300.0
}

#[derive(Debug, Serialize)]
pub struct Analisis {
    /// Longitud del trazado (0 para un punto).
    distancia_km: f64,
    riesgo: Evaluacion,
    puntos_interes: Vec<Cercano>,
    personas: Vec<Cercano>,
    objetos: Vec<Cercano>,
    rutas: Vec<Cercano>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Cercano {
    id: Uuid,
    nombre: String,
    /// nivel_riesgo (POI), hostilidad (persona), clase_yolo (objeto) o seguridad (ruta).
    detalle: Option<String>,
    distancia_m: f64,
}

/// `POST /v1/rutas/analizar` — hallazgos y peligros dentro del corredor del trazado.
pub async fn analizar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(t): Json<Trazado>,
) -> ApiResult<Json<Analisis>> {
    if t.waypoints.len() < 2 || t.waypoints.len() > MAX_WAYPOINTS {
        return Err(ApiError::Invalido(format!(
            "entre 2 y {MAX_WAYPOINTS} waypoints"
        )));
    }
    let coords = t
        .waypoints
        .iter()
        .map(|[lat, lng]| Coordenada::new(*lat, *lng).map(|c| [c.lng, c.lat]))
        .collect::<Result<Vec<_>, _>>()?;
    let geojson = json!({ "type": "LineString", "coordinates": coords }).to_string();
    let metros = limitar(t.corredor_m)?;
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let a = consultar(&mut tx, &geojson, metros, false).await?;
    tx.commit().await?;
    Ok(Json(a))
}

/// `GET /v1/alertas/cercanas?lat=&lng=&radio_m=` — solo lo peligroso alrededor.
pub async fn cercanas(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(c): Query<Cercania>,
) -> ApiResult<Json<Analisis>> {
    let punto = Coordenada::new(c.lat, c.lng)?;
    let geojson = json!({ "type": "Point", "coordinates": [punto.lng, punto.lat] }).to_string();
    let metros = limitar(c.radio_m)?;
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let a = consultar(&mut tx, &geojson, metros, true).await?;
    tx.commit().await?;
    Ok(Json(a))
}

fn limitar(metros: f64) -> ApiResult<f64> {
    if metros.is_finite() && (1.0..=MAX_RADIO_M).contains(&metros) {
        Ok(metros)
    } else {
        Err(ApiError::Invalido(format!(
            "el radio/corredor va de 1 a {MAX_RADIO_M} m"
        )))
    }
}

async fn consultar(
    tx: &mut Tx<'_>,
    geojson: &str,
    metros: f64,
    solo_peligros: bool,
) -> ApiResult<Analisis> {
    // $1 = geometría GeoJSON, $2 = metros, $3 = solo peligros, $4 = límite
    const GEOM: &str =
        "extensions.st_setsrid(extensions.st_geomfromgeojson($1), 4326)::extensions.geography";

    let pois: Vec<Cercano> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "select id, nombre, nivel_riesgo as detalle, extensions.st_distance(posicion, {GEOM}) as distancia_m
         from public.puntos_interes
         where eliminado_en is null and estado <> 'inactivo'
           and extensions.st_dwithin(posicion, {GEOM}, $2)
           and (not $3 or nivel_riesgo in ('alto', 'critico'))
         order by distancia_m limit $4"
    )))
    .bind(geojson)
    .bind(metros)
    .bind(solo_peligros)
    .bind(MAX_RESULTADOS)
    .fetch_all(&mut **tx)
    .await?;

    let personas: Vec<Cercano> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "select id, nombre, hostilidad as detalle, extensions.st_distance(posicion, {GEOM}) as distancia_m
         from public.personas
         where eliminado_en is null
           and extensions.st_dwithin(posicion, {GEOM}, $2)
           and (not $3 or hostilidad = 'hostil')
         order by distancia_m limit $4"
    )))
    .bind(geojson)
    .bind(metros)
    .bind(solo_peligros)
    .bind(MAX_RESULTADOS)
    .fetch_all(&mut **tx)
    .await?;

    let objetos: Vec<Cercano> = if solo_peligros {
        Vec::new()
    } else {
        sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "select id, nombre, clase_yolo as detalle, extensions.st_distance(posicion, {GEOM}) as distancia_m
             from public.objetos
             where eliminado_en is null and extensions.st_dwithin(posicion, {GEOM}, $2)
             order by distancia_m limit $3"
        )))
        .bind(geojson)
        .bind(metros)
        .bind(MAX_RESULTADOS)
        .fetch_all(&mut **tx)
        .await?
    };

    let rutas: Vec<Cercano> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "select id, nombre, seguridad as detalle, extensions.st_distance(trazado, {GEOM}) as distancia_m
         from public.rutas
         where eliminado_en is null and trazado is not null
           and extensions.st_dwithin(trazado, {GEOM}, $2)
           and (not $3 or seguridad = 'peligro')
         order by distancia_m limit $4"
    )))
    .bind(geojson)
    .bind(metros)
    .bind(solo_peligros)
    .bind(MAX_RESULTADOS)
    .fetch_all(&mut **tx)
    .await?;

    let distancia_m: f64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "select extensions.st_length({GEOM})"
    )))
    .bind(geojson)
    .fetch_one(&mut **tx)
    .await?;

    let peligros = pois
        .iter()
        .filter_map(|p| {
            p.detalle
                .as_deref()?
                .parse::<NivelRiesgo>()
                .ok()
                .map(Peligro::Poi)
        })
        .chain(
            personas
                .iter()
                .filter(|p| {
                    p.detalle.as_deref().and_then(|h| h.parse().ok()) == Some(Hostilidad::Hostil)
                })
                .map(|_| Peligro::PersonaHostil),
        )
        .chain(rutas.iter().filter_map(|r| {
            r.detalle
                .as_deref()?
                .parse::<Seguridad>()
                .ok()
                .map(Peligro::Ruta)
        }));

    Ok(Analisis {
        distancia_km: (distancia_m / 10.0).round() / 100.0,
        riesgo: evaluar(peligros),
        puntos_interes: pois,
        personas,
        objetos,
        rutas,
    })
}
