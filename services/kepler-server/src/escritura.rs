//! Inserción y actualización genéricas a partir de filas JSON ya validadas.
//!
//! Se apoya en `jsonb_populate_record` con la lista real de columnas de cada
//! tabla (excluye las generadas). La columna cursor de sincronización siempre
//! la fija el servidor con `now()`.
//!
//! SQL dinámico auditado: tablas de la lista cerrada `Tabla` y columnas leídas
//! del esquema al arrancar; los datos del cliente van siempre como `$1`.

use serde_json::Value;
use sqlx::AssertSqlSafe;
use uuid::Uuid;

use crate::db::{Db, Tx, lista_columnas};
use crate::error::ApiResult;
use crate::tablas::Tabla;

/// Columnas que nunca cambian en un UPDATE (o que gestiona el trigger).
const INMUTABLES: &[&str] = &["id", "user_id", "creado_en", "version", "actualizado_en"];

/// Inserta la fila si su id no existe. Devuelve `false` si ya existía
/// (o pertenece a otro usuario y RLS la oculta).
pub async fn insertar(db: &Db, tx: &mut Tx<'_>, tabla: Tabla, fila: &Value) -> ApiResult<bool> {
    let columnas = db.columnas(tabla);
    let cursor = tabla.columna_cursor();
    let valores = columnas
        .iter()
        .map(|c| {
            if c == cursor {
                "now()".to_owned()
            } else {
                format!("r.\"{c}\"")
            }
        })
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "insert into public.{t} ({cols})
         select {valores} from jsonb_populate_record(null::public.{t}, $1::jsonb) r
         on conflict (id) do nothing
         returning id",
        t = tabla.nombre(),
        cols = lista_columnas(columnas),
    );
    let id: Option<Uuid> = sqlx::query_scalar(AssertSqlSafe(sql))
        .bind(fila)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(id.is_some())
}

/// Aplica la fila sobre la existente. Las claves ausentes conservan el valor
/// del servidor (p. ej. el embedding calculado allí).
pub async fn actualizar(
    db: &Db,
    tx: &mut Tx<'_>,
    tabla: Tabla,
    id: Uuid,
    fila: &Value,
) -> ApiResult<()> {
    let editables: Vec<&String> = db
        .columnas(tabla)
        .iter()
        .filter(|c| !INMUTABLES.contains(&c.as_str()))
        .collect();
    let sql = format!(
        "update public.{t} t set ({cols}) =
            (select {sel} from jsonb_populate_record(t, $1::jsonb) r)
         where t.id = $2",
        t = tabla.nombre(),
        cols = lista_columnas(editables.iter().copied()),
        sel = editables
            .iter()
            .map(|c| format!("r.\"{c}\""))
            .collect::<Vec<_>>()
            .join(", "),
    );
    sqlx::query(AssertSqlSafe(sql))
        .bind(fila)
        .bind(id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
