//! Acceso a Postgres respetando RLS.
//!
//! El servidor se conecta como `authenticator` y cada petición abre una
//! transacción con el rol `authenticated` y los claims del JWT, igual que
//! PostgREST: las políticas (`auth.uid()`) se aplican también al servidor.

use std::collections::HashMap;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use sqlx::{AssertSqlSafe, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::tablas::Tabla;

pub type Tx<'c> = Transaction<'c, Postgres>;

pub struct Db {
    pub pool: PgPool,
    /// Columnas escribibles (no generadas) de cada tabla sincronizable.
    columnas: HashMap<Tabla, Vec<String>>,
}

impl Db {
    pub async fn conectar(url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await?;

        let mut tx = pool.begin().await?;
        sqlx::query("select set_config('role', 'authenticated', true)")
            .execute(&mut *tx)
            .await?;
        let filas: Vec<(String, String)> = sqlx::query_as(
            "select table_name::text, column_name::text
             from information_schema.columns
             where table_schema = 'public' and is_generated = 'NEVER' and table_name = any($1)
             order by ordinal_position",
        )
        .bind(Tabla::TODAS.iter().map(|t| t.nombre()).collect::<Vec<_>>())
        .fetch_all(&mut *tx)
        .await?;
        tx.rollback().await?;

        let mut columnas: HashMap<Tabla, Vec<String>> = HashMap::new();
        for (tabla, columna) in filas {
            if let Some(t) = Tabla::desde_nombre(&tabla) {
                columnas.entry(t).or_default().push(columna);
            }
        }
        if let Some(falta) = Tabla::TODAS.iter().find(|t| !columnas.contains_key(t)) {
            return Err(sqlx::Error::Configuration(
                format!(
                    "no se ven columnas de {}: ¿migraciones aplicadas?",
                    falta.nombre()
                )
                .into(),
            ));
        }
        Ok(Self { pool, columnas })
    }

    /// Transacción con la identidad del usuario (RLS activo).
    pub async fn como_usuario(&self, sesion: &Sesion) -> ApiResult<Tx<'static>> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "select set_config('role', 'authenticated', true),
                    set_config('request.jwt.claims', $1, true),
                    set_config('request.jwt.claim.sub', $2, true)",
        )
        .bind(&sesion.claims_json)
        .bind(sesion.user_id.to_string())
        .execute(&mut *tx)
        .await?;
        Ok(tx)
    }

    /// Pool sin conectar, para tests de rutas que no llegan a la base.
    #[cfg(test)]
    pub fn sin_conexion() -> Self {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://nadie@127.0.0.1:1/nada")
            .expect("url de prueba");
        Self {
            pool,
            columnas: HashMap::new(),
        }
    }

    pub fn columnas(&self, tabla: Tabla) -> &[String] {
        &self.columnas[&tabla]
    }
}

/// Fila como JSON (sin la columna generada `posicion`).
pub async fn leer_json(tx: &mut Tx<'_>, tabla: Tabla, id: Uuid) -> ApiResult<Option<Value>> {
    let sql = format!(
        "select to_jsonb(t) - 'posicion' from public.{} t where id = $1",
        tabla.nombre()
    );
    Ok(sqlx::query_scalar(AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?)
}

pub async fn leer<T: DeserializeOwned>(
    tx: &mut Tx<'_>,
    tabla: Tabla,
    id: Uuid,
) -> ApiResult<Option<T>> {
    match leer_json(tx, tabla, id).await? {
        Some(v) => Ok(Some(
            serde_json::from_value(v).map_err(|e| ApiError::Interno(e.to_string()))?,
        )),
        None => Ok(None),
    }
}

/// `"col1", "col2", ...` — los nombres vienen del esquema, no del cliente.
pub fn lista_columnas<'a>(columnas: impl IntoIterator<Item = &'a String>) -> String {
    columnas
        .into_iter()
        .map(|c| format!("\"{c}\""))
        .collect::<Vec<_>>()
        .join(", ")
}
