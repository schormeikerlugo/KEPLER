use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Query, State};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::auth::Sesion;
use crate::error::ApiResult;
use crate::estado::Estado;

#[derive(Debug, Deserialize)]
pub struct Params {
    /// Zona horaria para agrupar por día (p. ej. `America/Caracas`).
    zona: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Dashboard {
    conteos: Conteos,
    recientes: BTreeMap<&'static str, Vec<Value>>,
    alertas: Alertas,
    /// Distancia recorrida por día, últimos 7 días (hoy al final).
    semana: Vec<Dia>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct Conteos {
    misiones: i64,
    misiones_activas: i64,
    objetos: i64,
    personas: i64,
    puntos_interes: i64,
    rutas: i64,
}

/// Lo que el dashboard marca como "requiere atención".
#[derive(Debug, Serialize, sqlx::FromRow)]
struct Alertas {
    pois_riesgo_alto: i64,
    personas_hostiles: i64,
    misiones_sin_reporte: i64,
    objetos_baja_confianza: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct Dia {
    fecha: NaiveDate,
    distancia_km: f64,
}

const RECIENTES: &[(&str, &str)] = &[
    (
        "misiones",
        "select to_jsonb(t) from public.misiones t where eliminado_en is null order by creado_en desc limit 5",
    ),
    (
        "objetos",
        "select to_jsonb(t) - 'posicion' - 'embedding' from public.objetos t where eliminado_en is null order by capturado_en desc limit 5",
    ),
    (
        "personas",
        "select to_jsonb(t) - 'posicion' - 'embedding' from public.personas t where eliminado_en is null order by capturado_en desc limit 5",
    ),
    (
        "puntos_interes",
        "select to_jsonb(t) - 'posicion' - 'embedding' from public.puntos_interes t where eliminado_en is null order by capturado_en desc limit 5",
    ),
    (
        "rutas",
        "select to_jsonb(t) - 'trazado' from public.rutas t where eliminado_en is null order by creado_en desc limit 5",
    ),
];

/// `GET /v1/dashboard?zona=America/Caracas`
pub async fn resumen(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<Params>,
) -> ApiResult<Json<Dashboard>> {
    let zona = p.zona.unwrap_or_else(|| estado.config.zona_horaria.clone());
    let mut tx = estado.db.como_usuario(&sesion).await?;

    let conteos: Conteos = sqlx::query_as(
        "select
            (select count(*) from public.misiones where eliminado_en is null) as misiones,
            (select count(*) from public.misiones where eliminado_en is null and estado = 'activa') as misiones_activas,
            (select count(*) from public.objetos where eliminado_en is null) as objetos,
            (select count(*) from public.personas where eliminado_en is null) as personas,
            (select count(*) from public.puntos_interes where eliminado_en is null) as puntos_interes,
            (select count(*) from public.rutas where eliminado_en is null) as rutas",
    )
    .fetch_one(&mut *tx)
    .await?;

    let alertas: Alertas = sqlx::query_as(
        "select
            (select count(*) from public.puntos_interes
              where eliminado_en is null and nivel_riesgo in ('alto', 'critico') and estado <> 'inactivo') as pois_riesgo_alto,
            (select count(*) from public.personas
              where eliminado_en is null and hostilidad = 'hostil') as personas_hostiles,
            (select count(*) from public.misiones
              where eliminado_en is null and estado = 'completada' and coalesce(descripcion_ia, '') = '') as misiones_sin_reporte,
            (select count(*) from public.objetos
              where eliminado_en is null and confianza < 0.5) as objetos_baja_confianza",
    )
    .fetch_one(&mut *tx)
    .await?;

    let mut recientes = BTreeMap::new();
    for (nombre, sql) in RECIENTES {
        recientes.insert(*nombre, sqlx::query_scalar(*sql).fetch_all(&mut *tx).await?);
    }

    let semana: Vec<Dia> = sqlx::query_as(
        "with hoy as (select (now() at time zone $1)::date as d)
         select dia::date as fecha,
                coalesce(sum(m.distancia_m), 0) / 1000.0 as distancia_km
         from hoy, generate_series(hoy.d - 6, hoy.d, interval '1 day') as dia
         left join public.misiones m
           on m.estado = 'completada' and m.eliminado_en is null
          and (m.fin_en at time zone $1)::date = dia::date
         group by dia order by dia",
    )
    .bind(&zona)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(Dashboard {
        conteos,
        recientes,
        alertas,
        semana,
    }))
}
