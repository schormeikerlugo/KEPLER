use axum::Json;
use axum::extract::State;
use kepler_core::modelos::{Categoria, PoiCategoria, Subcategoria};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::auth::Sesion;
use crate::db::Tx;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

#[derive(Serialize)]
pub struct Catalogos {
    categorias: Vec<Categoria>,
    subcategorias: Vec<Subcategoria>,
    poi_categorias: Vec<PoiCategoria>,
}

/// `GET /v1/catalogos` — taxonomía y categorías de POI (se cachean en el dispositivo).
pub async fn listar(State(estado): State<Estado>, sesion: Sesion) -> ApiResult<Json<Catalogos>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let catalogos = Catalogos {
        categorias: filas(
            &mut tx,
            "select to_jsonb(c) from public.categorias c order by orden, nombre",
        )
        .await?,
        subcategorias: filas(
            &mut tx,
            "select to_jsonb(s) from public.subcategorias s order by nombre",
        )
        .await?,
        poi_categorias: filas(
            &mut tx,
            "select to_jsonb(p) from public.poi_categorias p order by orden",
        )
        .await?,
    };
    tx.commit().await?;
    Ok(Json(catalogos))
}

async fn filas<T: DeserializeOwned>(tx: &mut Tx<'_>, sql: &'static str) -> ApiResult<Vec<T>> {
    let valores: Vec<Value> = sqlx::query_scalar(sql).fetch_all(&mut **tx).await?;
    valores
        .into_iter()
        .map(|v| serde_json::from_value(v).map_err(|e| ApiError::Interno(e.to_string())))
        .collect()
}
