//! Inteligencia de rutas (PostGIS): qué hay a lo largo de un trazado o
//! alrededor del explorador, y cuánto riesgo supone.
//!
//! Se consideran los hallazgos propios y lo que comparten los demás: POIs,
//! objetos compartidos y alertas de personas hostiles. Las rutas son privadas:
//! solo cuentan las propias. Cada reporte compartido lleva su autor y su
//! vigencia, que pondera el riesgo.

use axum::Json;
use axum::extract::{Query, State};
use chrono::{DateTime, Utc};
use kepler_core::riesgo::{Evaluacion, Peligro, evaluar};
use kepler_core::vigencia::Vigencia;
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

#[derive(Debug, Serialize)]
pub struct Cercano {
    id: Uuid,
    nombre: String,
    /// nivel_riesgo (POI), hostilidad (persona), clase_yolo (objeto) o seguridad (ruta).
    detalle: Option<String>,
    distancia_m: f64,
    /// `false` = lo reportó otro explorador.
    propio: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    autor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    descripcion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    imagen_path: Option<String>,
    /// Solo POIs y personas hostiles.
    #[serde(skip_serializing_if = "Option::is_none")]
    vigencia: Option<Vigencia>,
}

#[derive(sqlx::FromRow)]
struct Fila {
    id: Uuid,
    nombre: String,
    detalle: Option<String>,
    distancia_m: f64,
    propio: bool,
    autor: Option<String>,
    descripcion: Option<String>,
    imagen_path: Option<String>,
    reportado_en: Option<DateTime<Utc>>,
    ultima_confirmacion: Option<DateTime<Utc>>,
    ultimo_rechazo: Option<DateTime<Utc>>,
}

impl Fila {
    fn cercano(self, con_vigencia: bool, ahora: DateTime<Utc>) -> Cercano {
        let vigencia = match (con_vigencia, self.reportado_en) {
            (true, Some(r)) => Some(Vigencia::calcular(
                r,
                self.ultima_confirmacion,
                self.ultimo_rechazo,
                ahora,
            )),
            _ => None,
        };
        Cercano {
            id: self.id,
            nombre: self.nombre,
            detalle: self.detalle,
            distancia_m: self.distancia_m,
            propio: self.propio,
            autor: if self.propio { None } else { self.autor },
            descripcion: self.descripcion,
            imagen_path: self.imagen_path,
            vigencia,
        }
    }
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

/// Últimas confirmaciones de cada tipo para la fila `x` de `entidad`.
macro_rules! confirmaciones {
    ($entidad:literal) => {
        concat!(
            "(select max(c.creado_en) from public.confirmaciones c where c.entidad = '",
            $entidad,
            "' and c.registro_id = x.id and c.tipo = 'vigente') as ultima_confirmacion, ",
            "(select max(c.creado_en) from public.confirmaciones c where c.entidad = '",
            $entidad,
            "' and c.registro_id = x.id and c.tipo = 'no_vigente') as ultimo_rechazo"
        )
    };
}

const SIN_CONFIRMACIONES: &str =
    "null::timestamptz as ultima_confirmacion, null::timestamptz as ultimo_rechazo";

async fn consultar(
    tx: &mut Tx<'_>,
    geojson: &str,
    metros: f64,
    solo_peligros: bool,
) -> ApiResult<Analisis> {
    // $1 = geometría GeoJSON, $2 = metros, $3 = solo peligros, $4 = límite
    const GEOM: &str =
        "extensions.st_setsrid(extensions.st_geomfromgeojson($1), 4326)::extensions.geography";
    const YO: &str = "(select auth.uid())";
    let conf_poi = confirmaciones!("poi");
    let conf_persona = confirmaciones!("persona");

    // RLS: propios + compartidos
    let pois = filas(
        tx,
        format!(
            "select x.id, x.nombre, x.nivel_riesgo as detalle,
                extensions.st_distance(x.posicion, {GEOM}) as distancia_m,
                x.user_id = {YO} as propio, e.nombre_usuario as autor,
                x.descripcion, x.imagen_path, x.capturado_en as reportado_en, {conf_poi}
         from public.puntos_interes x
         left join public.exploradores e on e.id = x.user_id
         where x.eliminado_en is null and x.estado <> 'inactivo'
           and extensions.st_dwithin(x.posicion, {GEOM}, $2)
           and (not $3 or x.nivel_riesgo in ('alto', 'critico'))
         order by distancia_m limit $4"
        ),
        geojson,
        metros,
        solo_peligros,
    )
    .await?;

    // Personas propias + alertas de personas hostiles de los demás (sin nombre)
    let personas = filas(
        tx,
        format!(
            "select * from (
            select x.id, x.nombre, x.hostilidad as detalle,
                   extensions.st_distance(x.posicion, {GEOM}) as distancia_m,
                   true as propio, null::text as autor,
                   x.rasgos_fisicos as descripcion, x.imagen_path,
                   x.capturado_en as reportado_en, {conf_persona}
            from public.personas x
            where x.eliminado_en is null
              and extensions.st_dwithin(x.posicion, {GEOM}, $2)
              and (not $3 or x.hostilidad = 'hostil')
            union all
            select x.id, 'Persona hostil', 'hostil',
                   extensions.st_distance(x.posicion, {GEOM}),
                   false, x.autor, x.rasgos_fisicos, x.imagen_path,
                   x.capturado_en, {conf_persona}
            from public.alertas_personas x
            where x.user_id <> {YO} and extensions.st_dwithin(x.posicion, {GEOM}, $2)
         ) t order by distancia_m limit $4"
        ),
        geojson,
        metros,
        solo_peligros,
    )
    .await?;

    let objetos = if solo_peligros {
        Vec::new()
    } else {
        filas(tx, format!(
            "select x.id, x.nombre, x.clase_yolo as detalle,
                    extensions.st_distance(x.posicion, {GEOM}) as distancia_m,
                    x.user_id = {YO} as propio, e.nombre_usuario as autor,
                    x.descripcion, x.imagen_path, x.capturado_en as reportado_en, {SIN_CONFIRMACIONES}
             from public.objetos x
             left join public.exploradores e on e.id = x.user_id
             where x.eliminado_en is null and extensions.st_dwithin(x.posicion, {GEOM}, $2)
               and $3 = $3
             order by distancia_m limit $4"
        ), geojson, metros, solo_peligros).await?
    };

    // Rutas: privadas, solo las propias (RLS)
    let rutas = filas(
        tx,
        format!(
            "select x.id, x.nombre, x.seguridad as detalle,
                extensions.st_distance(x.trazado, {GEOM}) as distancia_m,
                true as propio, null::text as autor, null::text as descripcion,
                null::text as imagen_path, null::timestamptz as reportado_en, {SIN_CONFIRMACIONES}
         from public.rutas x
         where x.eliminado_en is null and x.trazado is not null
           and extensions.st_dwithin(x.trazado, {GEOM}, $2)
           and (not $3 or x.seguridad = 'peligro')
         order by distancia_m limit $4"
        ),
        geojson,
        metros,
        solo_peligros,
    )
    .await?;

    let distancia_m: f64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "select extensions.st_length({GEOM})"
    )))
    .bind(geojson)
    .fetch_one(&mut **tx)
    .await?;

    let ahora = Utc::now();
    let mut pois: Vec<Cercano> = pois.into_iter().map(|f| f.cercano(true, ahora)).collect();
    let mut personas: Vec<Cercano> = personas
        .into_iter()
        .map(|f| {
            let hostil = f.detalle.as_deref() == Some(Hostilidad::Hostil.como_str());
            f.cercano(hostil, ahora)
        })
        .collect();
    let objetos: Vec<Cercano> = objetos
        .into_iter()
        .map(|f| f.cercano(false, ahora))
        .collect();
    let rutas: Vec<Cercano> = rutas.into_iter().map(|f| f.cercano(false, ahora)).collect();

    // Las alertas cercanas no muestran reportes retirados
    if solo_peligros {
        pois.retain(|c| c.vigencia != Some(Vigencia::Retirado));
        personas.retain(|c| c.vigencia != Some(Vigencia::Retirado));
    }

    let vigencia = |c: &Cercano| c.vigencia.unwrap_or(Vigencia::Vigente);
    let peligros = pois
        .iter()
        .filter_map(|p| {
            Some((
                Peligro::Poi(p.detalle.as_deref()?.parse::<NivelRiesgo>().ok()?),
                vigencia(p),
            ))
        })
        .chain(
            personas
                .iter()
                .filter(|p| p.detalle.as_deref() == Some(Hostilidad::Hostil.como_str()))
                .map(|p| (Peligro::PersonaHostil, vigencia(p))),
        )
        .chain(rutas.iter().filter_map(|r| {
            Some((
                Peligro::Ruta(r.detalle.as_deref()?.parse::<Seguridad>().ok()?),
                Vigencia::Vigente,
            ))
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

/// SQL armado con constantes de este módulo; los datos van como parámetros.
async fn filas(
    tx: &mut Tx<'_>,
    sql: String,
    geojson: &str,
    metros: f64,
    solo_peligros: bool,
) -> ApiResult<Vec<Fila>> {
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(sql))
        .bind(geojson)
        .bind(metros)
        .bind(solo_peligros)
        .bind(MAX_RESULTADOS)
        .fetch_all(&mut **tx)
        .await?)
}
