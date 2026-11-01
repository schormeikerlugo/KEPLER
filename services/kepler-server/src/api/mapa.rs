//! Elementos para el mapa del Centro de Control, en GeoJSON.

use axum::Json;
use axum::extract::State;
use serde_json::Value;

use crate::auth::Sesion;
use crate::error::ApiResult;
use crate::estado::Estado;

/// Máximo de puntos por tipo (el mapa agrupa en el cliente).
const LIMITE: i64 = 5000;

/// `GET /v1/mapa/elementos` — `FeatureCollection` con POIs (propios y
/// compartidos), personas propias, alertas de personas hostiles de otros
/// exploradores y objetos propios. Propiedades: `tipo`, `id`, `nombre`,
/// `nivel`, `propio`, `autor`, `imagen_path`, `capturado_en`.
pub async fn elementos(State(estado): State<Estado>, sesion: Sesion) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let coleccion: Value = sqlx::query_scalar(
        "with puntos as (
            (select 'poi' as tipo, x.id, x.nombre, x.nivel_riesgo as nivel,
                    x.user_id = (select auth.uid()) as propio, e.nombre_usuario as autor,
                    x.imagen_path, x.capturado_en, x.lat, x.lng
             from public.puntos_interes x
             left join public.exploradores e on e.id = x.user_id
             where x.eliminado_en is null and x.estado <> 'inactivo' and x.lat is not null
             order by x.capturado_en desc limit $1)
            union all
            (select 'persona', x.id, x.nombre, x.hostilidad, true, null, x.imagen_path,
                    x.capturado_en, x.lat, x.lng
             from public.personas x
             where x.user_id = (select auth.uid()) and x.eliminado_en is null and x.lat is not null
             order by x.capturado_en desc limit $1)
            union all
            (select 'alerta', x.id, 'Persona hostil', 'hostil', false, x.autor, x.imagen_path,
                    x.capturado_en, x.lat, x.lng
             from public.alertas_personas x
             where x.user_id <> (select auth.uid()) and x.lat is not null
             order by x.capturado_en desc limit $1)
            union all
            (select 'objeto', x.id, x.nombre, x.clase_yolo, true, null, x.imagen_path,
                    x.capturado_en, x.lat, x.lng
             from public.objetos x
             where x.user_id = (select auth.uid()) and x.eliminado_en is null and x.lat is not null
             order by x.capturado_en desc limit $1)
         )
         select jsonb_build_object(
             'type', 'FeatureCollection',
             'features', coalesce(jsonb_agg(jsonb_build_object(
                 'type', 'Feature',
                 'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(lng, lat)),
                 'properties', jsonb_build_object(
                     'tipo', tipo, 'id', id, 'nombre', nombre, 'nivel', nivel, 'propio', propio,
                     'autor', autor, 'imagen_path', imagen_path, 'capturado_en', capturado_en)
             )), '[]'::jsonb))
         from puntos",
    )
    .bind(LIMITE)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(coleccion))
}
