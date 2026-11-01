//! Bitácora: notificaciones del explorador (las genera la base de datos y el
//! procesado de capturas; ver la migración 0006).

use axum::Json;
use axum::extract::{Query, State};
use chrono::{DateTime, Utc};
use kepler_core::TipoNotificacion;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::auth::Sesion;
use crate::db::Tx;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

const LIMITE_MAX: i64 = 200;

#[derive(Debug, Deserialize)]
pub struct Params {
    limite: Option<i64>,
    /// Paginación: las anteriores a esta fecha.
    antes: Option<DateTime<Utc>>,
    tipo: Option<TipoNotificacion>,
    #[serde(default)]
    solo_no_leidas: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Entrada {
    id: Uuid,
    tipo: String,
    mensaje: String,
    leida: bool,
    contexto: Option<Value>,
    creado_en: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct Lista {
    items: Vec<Entrada>,
    no_leidas: i64,
}

/// `GET /v1/notificaciones?limite=&antes=&tipo=&solo_no_leidas=`
pub async fn listar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<Params>,
) -> ApiResult<Json<Lista>> {
    let limite = p.limite.unwrap_or(50);
    if !(1..=LIMITE_MAX).contains(&limite) {
        return Err(ApiError::Invalido(format!("limite entre 1 y {LIMITE_MAX}")));
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let items: Vec<Entrada> = sqlx::query_as(
        "select id, tipo, mensaje, leida, contexto, creado_en
         from public.notificaciones
         where eliminado_en is null
           and ($1::timestamptz is null or creado_en < $1)
           and ($2::text is null or tipo = $2)
           and (not $3 or not leida)
         order by creado_en desc
         limit $4",
    )
    .bind(p.antes)
    .bind(p.tipo.map(|t| t.como_str()))
    .bind(p.solo_no_leidas)
    .bind(limite)
    .fetch_all(&mut *tx)
    .await?;
    let no_leidas = no_leidas(&mut tx).await?;
    tx.commit().await?;
    Ok(Json(Lista { items, no_leidas }))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Leer {
    #[serde(default)]
    ids: Vec<Uuid>,
    #[serde(default)]
    todas: bool,
}

#[derive(Debug, Serialize)]
pub struct Leidas {
    marcadas: u64,
    no_leidas: i64,
}

/// `POST /v1/notificaciones/leer` — `{ "ids": [...] }` o `{ "todas": true }`.
pub async fn leer(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(l): Json<Leer>,
) -> ApiResult<Json<Leidas>> {
    if l.todas == !l.ids.is_empty() {
        return Err(ApiError::Invalido(
            "indica `ids` o `todas`, no ambos".into(),
        ));
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let marcadas = sqlx::query(
        "update public.notificaciones set leida = true
         where not leida and eliminado_en is null and ($1 or id = any($2))",
    )
    .bind(l.todas)
    .bind(&l.ids)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    let no_leidas = no_leidas(&mut tx).await?;
    tx.commit().await?;
    Ok(Json(Leidas {
        marcadas,
        no_leidas,
    }))
}

async fn no_leidas(tx: &mut Tx<'_>) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "select count(*) from public.notificaciones where not leida and eliminado_en is null",
    )
    .fetch_one(&mut **tx)
    .await?)
}

/// Escribe una entrada en la bitácora del usuario de la sesión.
pub(crate) async fn notificar(
    tx: &mut Tx<'_>,
    tipo: TipoNotificacion,
    mensaje: &str,
    contexto: Value,
) -> ApiResult<()> {
    sqlx::query("insert into public.notificaciones (tipo, mensaje, contexto) values ($1, $2, $3)")
        .bind(tipo.como_str())
        .bind(mensaje)
        .bind(contexto)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
