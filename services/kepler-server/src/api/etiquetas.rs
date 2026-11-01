//! Etiquetas personales de los objetos (p. ej. «frecuente», «peligro»).

use axum::Json;
use axum::extract::{Path, State};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

/// `GET /v1/etiquetas` — con cuántos objetos lleva cada una.
pub async fn listar(State(estado): State<Estado>, sesion: Sesion) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let v: Value = sqlx::query_scalar(
        "select coalesce(jsonb_agg(e order by e.nombre), '[]') from (
            select t.id, t.nombre, t.color,
                   (select count(*) from public.objeto_etiquetas oe
                    join public.objetos o on o.id = oe.objeto_id and o.eliminado_en is null
                    where oe.etiqueta_id = t.id) as objetos
            from public.etiquetas t) e",
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Nueva {
    nombre: String,
    color: Option<String>,
}

/// `POST /v1/etiquetas` — `{nombre, color?}` (`#RRGGBB`).
pub async fn crear(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(n): Json<Nueva>,
) -> ApiResult<Json<Value>> {
    let nombre = n.nombre.trim();
    if nombre.is_empty() || nombre.chars().count() > 40 {
        return Err(ApiError::Invalido(
            "el nombre va de 1 a 40 caracteres".into(),
        ));
    }
    let color = n.color.unwrap_or_else(|| "#3FA8FF".into());
    let valido = color.len() == 7
        && color.starts_with('#')
        && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valido {
        return Err(ApiError::Invalido("color: #RRGGBB".into()));
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let v: Value = sqlx::query_scalar(
        "insert into public.etiquetas (nombre, color) values ($1, $2)
         returning jsonb_build_object('id', id, 'nombre', nombre, 'color', color, 'objetos', 0)",
    )
    .bind(nombre)
    .bind(&color)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(v))
}

/// `DELETE /v1/etiquetas/{id}` — también la quita de los objetos.
pub async fn borrar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let n = sqlx::query("delete from public.etiquetas where id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    tx.commit().await?;
    if n == 0 {
        return Err(ApiError::NoEncontrado("etiqueta no encontrada"));
    }
    Ok(Json(json!({ "borrada": id })))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Asignar {
    etiquetas: Vec<Uuid>,
}

/// `PUT /v1/objetos/{id}/etiquetas` — `{etiquetas: [...]}` reemplaza las del objeto.
pub async fn asignar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(objeto): Path<Uuid>,
    Json(a): Json<Asignar>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let propio: Option<Uuid> = sqlx::query_scalar(
        "select id from public.objetos where id = $1 and user_id = (select auth.uid()) and eliminado_en is null",
    )
    .bind(objeto)
    .fetch_optional(&mut *tx)
    .await?;
    if propio.is_none() {
        return Err(ApiError::NoEncontrado("objeto no encontrado"));
    }
    sqlx::query("delete from public.objeto_etiquetas where objeto_id = $1")
        .bind(objeto)
        .execute(&mut *tx)
        .await?;
    // Solo etiquetas propias: la RLS de `etiquetas` oculta las ajenas
    sqlx::query(
        "insert into public.objeto_etiquetas (objeto_id, etiqueta_id)
         select $1, t.id from public.etiquetas t where t.id = any($2) on conflict do nothing",
    )
    .bind(objeto)
    .bind(&a.etiquetas)
    .execute(&mut *tx)
    .await?;
    let v: Value = sqlx::query_scalar(SQL_DEL_OBJETO)
        .bind(objeto)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(v))
}

/// Etiquetas de un objeto como `[{id, nombre, color}]`.
pub const SQL_DEL_OBJETO: &str =
    "select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre, 'color', t.color)
                                     order by t.nombre), '[]')
     from public.objeto_etiquetas oe join public.etiquetas t on t.id = oe.etiqueta_id
     where oe.objeto_id = $1";
