//! Sincronización offline-first.
//!
//! Bajar: `GET /v1/sync/cambios?desde=<cursor>` devuelve lo cambiado desde el
//! cursor (incluye borrados lógicos) y el cursor siguiente. El cursor se queda
//! unos segundos por detrás de `now()` para no perder transacciones que aún
//! no habían confirmado; por eso pueden llegar filas repetidas (idempotente).
//!
//! Subir: `POST /v1/sync/subir` con `{ "<tabla>": [filas] }`. Cada fila se
//! valida con `kepler-core` y se resuelve con [`kepler_core::resolver_conflicto`].

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Query, State};
use chrono::{DateTime, Utc};
use kepler_core::{Ganador, Meta, resolver_conflicto};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Acquire, AssertSqlSafe};
use uuid::Uuid;

use crate::auth::Sesion;
use crate::db::{Tx, leer_json};
use crate::error::{ApiError, ApiResult};
use crate::escritura;
use crate::estado::Estado;
use crate::tablas::Tabla;

const LIMITE_POR_TABLA: i64 = 2000;
const MAX_FILAS_SUBIDA: usize = 2000;

#[derive(Debug, Deserialize)]
pub struct ParamsCambios {
    /// Cursor recibido en la llamada anterior; ausente = todo.
    desde: Option<DateTime<Utc>>,
    /// Incluir embeddings (pesados; solo para la caché de Re-ID offline).
    #[serde(default)]
    embeddings: bool,
    limite: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct Cambios {
    /// Pasar como `desde` en la próxima llamada.
    cursor: DateTime<Utc>,
    /// `false` si alguna tabla se cortó por el límite: volver a llamar ya.
    completo: bool,
    tablas: BTreeMap<&'static str, Vec<Value>>,
}

/// `GET /v1/sync/cambios`
pub async fn cambios(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<ParamsCambios>,
) -> ApiResult<Json<Cambios>> {
    let desde = p.desde.unwrap_or(DateTime::<Utc>::UNIX_EPOCH);
    let limite = p
        .limite
        .unwrap_or(LIMITE_POR_TABLA)
        .clamp(1, LIMITE_POR_TABLA);

    let mut tx = estado.db.como_usuario(&sesion).await?;
    let mut cursor: DateTime<Utc> = sqlx::query_scalar("select now() - interval '5 seconds'")
        .fetch_one(&mut *tx)
        .await?;
    let mut completo = true;
    let mut tablas = BTreeMap::new();

    for &tabla in Tabla::TODAS {
        let col = tabla.columna_cursor();
        let quitar = if tabla.tiene_embedding() && !p.embeddings {
            " - 'embedding'"
        } else {
            ""
        };
        // Tabla y columna salen de la lista cerrada `Tabla`, no del cliente.
        let sql = format!(
            "select to_jsonb(t) - 'posicion'{quitar} from public.{} t
             where t.{col} >= $1 order by t.{col} limit $2",
            tabla.nombre()
        );
        let filas: Vec<Value> = sqlx::query_scalar(AssertSqlSafe(sql))
            .bind(desde)
            .bind(limite)
            .fetch_all(&mut *tx)
            .await?;

        if filas.len() as i64 == limite {
            completo = false;
            // Seguir desde la última fila devuelta (inclusive) en la próxima llamada.
            if let Some(ultimo) = filas
                .last()
                .and_then(|f| f[col].as_str())
                .and_then(|s| s.parse().ok())
            {
                cursor = cursor.min(ultimo);
            }
        }
        tablas.insert(tabla.nombre(), filas);
    }
    tx.commit().await?;
    Ok(Json(Cambios {
        cursor,
        completo,
        tablas,
    }))
}

#[derive(Debug, Default, Serialize)]
pub struct ResultadoSubida {
    /// Estado final en el servidor de cada fila aceptada: el dispositivo la guarda tal cual.
    aplicados: BTreeMap<&'static str, Vec<Value>>,
    conflictos: Vec<Conflicto>,
    rechazados: Vec<Rechazo>,
}

#[derive(Debug, Serialize)]
pub struct Conflicto {
    tabla: &'static str,
    id: Uuid,
    /// "cliente" (se aplicó la versión del dispositivo) o "servidor" (se conservó la del servidor).
    ganador: &'static str,
}

#[derive(Debug, Serialize)]
pub struct Rechazo {
    tabla: String,
    id: Option<Uuid>,
    motivo: String,
}

/// `POST /v1/sync/subir`
pub async fn subir(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(lote): Json<BTreeMap<String, Vec<Value>>>,
) -> ApiResult<Json<ResultadoSubida>> {
    let total: usize = lote.values().map(Vec::len).sum();
    if total > MAX_FILAS_SUBIDA {
        return Err(ApiError::Invalido(format!(
            "máximo {MAX_FILAS_SUBIDA} filas por subida"
        )));
    }
    if let Some(desconocida) = lote.keys().find(|t| Tabla::desde_nombre(t).is_none()) {
        return Err(ApiError::Invalido(format!(
            "tabla no sincronizable: {desconocida}"
        )));
    }

    let mut resultado = ResultadoSubida::default();
    let mut tx = estado.db.como_usuario(&sesion).await?;

    // En orden de dependencias (rutas → misiones → hallazgos)
    for &tabla in Tabla::TODAS {
        let Some(filas) = lote.get(tabla.nombre()) else {
            continue;
        };
        for fila in filas {
            let id_crudo = fila
                .get("id")
                .and_then(Value::as_str)
                .and_then(|s| s.parse().ok());
            let rechazar = |motivo: String| Rechazo {
                tabla: tabla.nombre().into(),
                id: id_crudo,
                motivo,
            };

            let (id, fila) = match tabla.validar(fila.clone(), sesion.user_id) {
                Ok(v) => v,
                Err(e) => {
                    resultado.rechazados.push(rechazar(e.to_string()));
                    continue;
                }
            };

            // Savepoint: una fila rechazada por la base no aborta el resto del lote.
            let mut sp = tx.begin().await?;
            match aplicar_fila(&estado, &mut sp, tabla, id, &fila).await {
                Ok((final_, conflicto)) => {
                    sp.commit().await?;
                    resultado
                        .aplicados
                        .entry(tabla.nombre())
                        .or_default()
                        .push(final_);
                    if let Some(ganador) = conflicto {
                        resultado.conflictos.push(Conflicto {
                            tabla: tabla.nombre(),
                            id,
                            ganador,
                        });
                    }
                }
                Err(e) => {
                    sp.rollback().await?;
                    let motivo = match &e {
                        ApiError::BaseDatos(sqlx::Error::Database(db)) => db.message().to_owned(),
                        otro => otro.to_string(),
                    };
                    resultado.rechazados.push(rechazar(motivo));
                }
            }
        }
    }
    tx.commit().await?;
    Ok(Json(resultado))
}

/// Devuelve la fila final y, si hubo conflicto, quién ganó.
async fn aplicar_fila(
    estado: &Estado,
    tx: &mut Tx<'_>,
    tabla: Tabla,
    id: Uuid,
    fila: &Value,
) -> ApiResult<(Value, Option<&'static str>)> {
    let db = &estado.db;
    let conflicto = match leer_json(tx, tabla, id).await? {
        None => {
            if !escritura::insertar(db, tx, tabla, fila).await? {
                return Err(ApiError::Conflicto("el id ya está en uso".into()));
            }
            None
        }
        // El rastro es inmutable: reenviar un punto es un no-op.
        Some(_) if tabla.solo_insercion() => None,
        Some(servidor) => {
            let local = meta_de(fila)?;
            let remoto = meta_de(&servidor)?;
            if local.version > remoto.version {
                escritura::actualizar(db, tx, tabla, id, fila).await?;
                None
            } else if mismo_contenido(fila, &servidor) {
                // Reenvío de algo ya aplicado (p. ej. se perdió la respuesta)
                None
            } else if resolver_conflicto(&local, &remoto) == Ganador::Local {
                escritura::actualizar(db, tx, tabla, id, fila).await?;
                Some("cliente")
            } else {
                Some("servidor")
            }
        }
    };
    let final_ = leer_json(tx, tabla, id)
        .await?
        .ok_or(ApiError::NoEncontrado("fila no visible"))?;
    Ok((final_, conflicto))
}

fn meta_de(fila: &Value) -> ApiResult<Meta> {
    // Meta es un subconjunto de la fila; serde ignora el resto de campos.
    serde_json::from_value(fila.clone()).map_err(|e| ApiError::Invalido(format!("meta: {e}")))
}

/// Compara solo los datos editables (sin metadatos de sincronización ni embedding).
fn mismo_contenido(cliente: &Value, servidor: &Value) -> bool {
    const IGNORAR: &[&str] = &[
        "actualizado_en",
        "version",
        "creado_en",
        "embedding",
        "posicion",
    ];
    let (Some(c), Some(s)) = (cliente.as_object(), servidor.as_object()) else {
        return false;
    };
    c.iter()
        .filter(|(k, _)| !IGNORAR.contains(&k.as_str()))
        .all(|(k, v)| s.get(k).is_some_and(|sv| iguales(v, sv)))
}

/// Igualdad tolerante a la representación (p. ej. `1` vs `1.0`, fechas con o sin `Z`).
fn iguales(a: &Value, b: &Value) -> bool {
    match (a, b) {
        // Columnas `real` (f32): serde_json las amplía a f64 (0.91 → 0.9100000262…)
        (Value::Number(x), Value::Number(y)) => match (x.as_f64(), y.as_f64()) {
            (Some(x), Some(y)) => (x - y).abs() <= 1e-6 * x.abs().max(y.abs()).max(1.0),
            _ => x == y,
        },
        (Value::String(x), Value::String(y)) if x != y => {
            match (x.parse::<DateTime<Utc>>(), y.parse::<DateTime<Utc>>()) {
                (Ok(dx), Ok(dy)) => dx == dy,
                _ => false,
            }
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter()
                    .all(|(k, v)| y.get(k).is_some_and(|w| iguales(v, w)))
        }
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(v, w)| iguales(v, w))
        }
        _ => a == b,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn contenido_igual_ignora_metadatos_y_formato() {
        let c = json!({"id": "a", "nombre": "Cuarzo", "confianza": 1, "version": 2,
                       "capturado_en": "2026-10-31T20:00:00Z", "atributos": {"d": 7}});
        let s = json!({"id": "a", "nombre": "Cuarzo", "confianza": 1.0, "version": 5,
                       "capturado_en": "2026-10-31T20:00:00+00:00", "atributos": {"d": 7.0},
                       "embedding": "[0.1]"});
        assert!(mismo_contenido(&c, &s));

        // f32 ampliado a f64 por serde_json frente al `real` que devuelve Postgres
        let c32 = json!({"confianza": 0.9100000262260437, "distancia_m": 2.4000000953674316});
        let s32 = json!({"confianza": 0.91, "distancia_m": 2.4});
        assert!(mismo_contenido(&c32, &s32));

        let distinto = json!({"id": "a", "nombre": "Pirita"});
        assert!(!mismo_contenido(&distinto, &s));
        assert!(!mismo_contenido(
            &json!({"lat": 10.4806}),
            &json!({"lat": 10.4807})
        ));
    }
}
