//! `POST /v1/capturas` — capturas con foto (Quick Capture, Sentinel, registro).
//!
//! Por cada captura: foto a Storage (`capturas/<user>/<entidad>/<id>.jpg`,
//! con la identidad del usuario), embedding CLIP, Re-ID contra lo ya visto y
//! guardado por el mismo camino que la sincronización (idempotente por id).
//!
//! Re-ID (similitud ≥ 0.78):
//! * persona: se vincula a la identidad encontrada (`identidad_id` y su nombre);
//! * POI: es un duplicado; no se crea otro y, si es de otro explorador, cuenta
//!   como confirmación de que sigue vigente;
//! * objeto: se guarda e informa del parecido.
//!
//! Sin modelos de visión se guarda igual, sin embedding ni Re-ID.

use axum::Json;
use axum::extract::State;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use chrono::Utc;
use kepler_core::Entidad;
use kepler_core::reid::UMBRAL_REID;
use kepler_proto::v1::{CapturaProcesada, CoincidenciaReId, Entidad as ProtoEntidad};
use kepler_proto::{Emisor, codificar, uuid_a_bytes};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Acquire;
use uuid::Uuid;

use super::sync::{aplicar_fila, avisar, es_peligro_compartido};
use crate::auth::Sesion;
use crate::db::{Tx, leer_json};
use crate::difusor::{Clase, Relevo};
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;
use crate::tablas::Tabla;

const MAX_CAPTURAS: usize = 10;
const MAX_IMAGEN: usize = 8 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Captura {
    entidad: Entidad,
    /// Fila como en `/v1/sync/subir` (id generado en el dispositivo).
    fila: Value,
    /// JPEG en base64.
    imagen: String,
}

#[derive(Debug, Serialize)]
pub struct Respuesta {
    procesadas: Vec<Procesada>,
    rechazadas: Vec<Rechazada>,
    /// `false` si no hay modelos: se guardó sin embedding ni Re-ID.
    vision: bool,
}

#[derive(Debug, Serialize)]
struct Procesada {
    entidad: Entidad,
    id: Uuid,
    /// `creada`, `actualizada` o `duplicado` (POI ya reportado: ver `reid`).
    accion: &'static str,
    imagen_path: Option<String>,
    reid: Option<Coincidencia>,
    /// Estado final en el servidor (sin embedding).
    fila: Value,
}

#[derive(Debug, Serialize)]
struct Rechazada {
    indice: usize,
    id: Option<Uuid>,
    motivo: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
struct Coincidencia {
    id: Uuid,
    nombre: String,
    similitud: f64,
}

/// Captura validada, a medio procesar.
struct Pendiente {
    indice: usize,
    entidad: Entidad,
    tabla: Tabla,
    id: Uuid,
    fila: Value,
    jpeg: Vec<u8>,
    embedding: Option<Vec<f32>>,
    reid: Option<Coincidencia>,
}

/// `POST /v1/capturas` — lote de hasta 10 capturas.
pub async fn procesar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(lote): Json<Vec<Captura>>,
) -> ApiResult<Json<Respuesta>> {
    if lote.is_empty() || lote.len() > MAX_CAPTURAS {
        return Err(ApiError::Invalido(format!(
            "entre 1 y {MAX_CAPTURAS} capturas por lote"
        )));
    }

    let mut rechazadas = Vec::new();
    let mut pendientes = Vec::new();
    for (indice, c) in lote.into_iter().enumerate() {
        match validar(indice, c, sesion.user_id) {
            Ok(p) => pendientes.push(p),
            Err(r) => rechazadas.push(r),
        }
    }

    // Embeddings en una sola inferencia (también comprueba que la imagen se decodifica)
    let vision = estado.vision.as_ref().ok().cloned();
    if !pendientes.is_empty() {
        let jpegs: Vec<Vec<u8>> = pendientes.iter().map(|p| p.jpeg.clone()).collect();
        let resultado = tokio::task::spawn_blocking(move || embeddings(vision.as_deref(), &jpegs))
            .await
            .map_err(|e| ApiError::Interno(e.to_string()))?;
        let mut conservar = Vec::new();
        for (mut p, r) in pendientes.into_iter().zip(resultado) {
            match r {
                Ok(e) => {
                    p.embedding = e;
                    conservar.push(p);
                }
                Err(motivo) => rechazadas.push(Rechazada {
                    indice: p.indice,
                    id: Some(p.id),
                    motivo,
                }),
            }
        }
        pendientes = conservar;
    }

    // Re-ID
    let mut tx = estado.db.como_usuario(&sesion).await?;
    for p in &mut pendientes {
        if let Some(e) = &p.embedding {
            p.reid = buscar(&mut tx, p.entidad, p.id, e).await?;
        }
    }
    tx.commit().await?;

    // Fotos a Storage (los POI duplicados no se guardan)
    let subidas = pendientes.iter().map(|p| async {
        if es_duplicado(p) {
            return Ok(None);
        }
        let ruta = format!("{}/{}/{}.jpg", sesion.user_id, p.entidad, p.id);
        subir_imagen(&estado, &sesion, &ruta, p.jpeg.clone())
            .await
            .map(|()| Some(ruta))
    });
    let rutas = futures_util::future::join_all(subidas).await;

    let mut tx = estado.db.como_usuario(&sesion).await?;
    let mut procesadas = Vec::new();
    let mut avisos = Vec::new();
    for (p, ruta) in pendientes.into_iter().zip(rutas) {
        let ruta = match ruta {
            Ok(r) => r,
            Err(motivo) => {
                rechazadas.push(Rechazada {
                    indice: p.indice,
                    id: Some(p.id),
                    motivo,
                });
                continue;
            }
        };
        let mut sp = tx.begin().await?;
        match guardar(&estado, &mut sp, &p, ruta.clone()).await {
            Ok((accion, fila)) => {
                sp.commit().await?;
                if accion == "creada" && es_peligro_compartido(p.tabla, &fila) {
                    avisos.push((p.tabla, fila.clone()));
                }
                procesadas.push(Procesada {
                    entidad: p.entidad,
                    id: p.id,
                    accion,
                    imagen_path: ruta,
                    reid: p.reid,
                    fila,
                });
            }
            Err(e) => {
                sp.rollback().await?;
                let motivo = match &e {
                    ApiError::BaseDatos(sqlx::Error::Database(db)) => db.message().to_owned(),
                    otro => otro.to_string(),
                };
                rechazadas.push(Rechazada {
                    indice: p.indice,
                    id: Some(p.id),
                    motivo,
                });
            }
        }
    }
    let autor: Option<String> =
        sqlx::query_scalar("select nombre_usuario from public.perfiles where id = $1")
            .bind(sesion.user_id)
            .fetch_optional(&mut *tx)
            .await?;
    tx.commit().await?;

    for p in &procesadas {
        publicar(&estado, &sesion, p);
    }
    for (tabla, fila) in avisos {
        avisar(
            &estado,
            &sesion,
            tabla,
            &fila,
            autor.as_deref().unwrap_or_default(),
        );
    }
    rechazadas.sort_by_key(|r| r.indice);
    Ok(Json(Respuesta {
        procesadas,
        rechazadas,
        vision: estado.vision.is_ok(),
    }))
}

fn validar(indice: usize, c: Captura, user_id: Uuid) -> Result<Pendiente, Rechazada> {
    let rechazo = |id, motivo: String| Rechazada { indice, id, motivo };
    let id_crudo = c
        .fila
        .get("id")
        .and_then(Value::as_str)
        .and_then(|s| s.parse().ok());
    let tabla = match c.entidad {
        Entidad::Persona => Tabla::Personas,
        Entidad::Poi => Tabla::PuntosInteres,
        Entidad::Objeto => Tabla::Objetos,
    };
    let (id, fila) = tabla
        .validar(c.fila, user_id)
        .map_err(|e| rechazo(id_crudo, e.to_string()))?;
    let jpeg = BASE64
        .decode(
            c.imagen
                .trim()
                .trim_start_matches("data:image/jpeg;base64,"),
        )
        .map_err(|e| rechazo(Some(id), format!("imagen: base64 inválido ({e})")))?;
    if jpeg.len() > MAX_IMAGEN {
        return Err(rechazo(
            Some(id),
            format!("imagen de {} bytes, máximo {MAX_IMAGEN}", jpeg.len()),
        ));
    }
    if !jpeg.starts_with(&[0xff, 0xd8, 0xff]) {
        return Err(rechazo(Some(id), "la imagen debe ser JPEG".into()));
    }
    Ok(Pendiente {
        indice,
        entidad: c.entidad,
        tabla,
        id,
        fila,
        jpeg,
        embedding: None,
        reid: None,
    })
}

/// Por imagen: `Ok(None)` sin modelos, `Err` si no se puede decodificar.
fn embeddings(
    vision: Option<&kepler_vision::Modelos>,
    jpegs: &[Vec<u8>],
) -> Vec<Result<Option<Vec<f32>>, String>> {
    let decodificadas: Vec<Result<kepler_vision::RgbImage, String>> = jpegs
        .iter()
        .map(|j| kepler_vision::decodificar(j).map_err(|e| e.to_string()))
        .collect();
    let Some(m) = vision else {
        return decodificadas.into_iter().map(|r| r.map(|_| None)).collect();
    };
    let validas: Vec<kepler_vision::RgbImage> = decodificadas
        .iter()
        .filter_map(|r| r.as_ref().ok().cloned())
        .collect();
    let mut calculados = match m.embebedor.lote(&validas) {
        Ok(e) => e.into_iter(),
        Err(e) => {
            return decodificadas
                .iter()
                .map(|_| Err(format!("CLIP: {e}")))
                .collect();
        }
    };
    decodificadas
        .into_iter()
        .map(|r| r.map(|_| calculados.next()))
        .collect()
}

async fn buscar(
    tx: &mut Tx<'_>,
    entidad: Entidad,
    propio: Uuid,
    e: &[f32],
) -> ApiResult<Option<Coincidencia>> {
    let candidatos: Vec<Coincidencia> = sqlx::query_as(
        "select id, nombre, similitud from public.buscar_similares($1, $2::extensions.vector, $3, 3)",
    )
    .bind(entidad.como_str())
    .bind(texto_vector(e))
    .bind(f64::from(UMBRAL_REID))
    .fetch_all(&mut **tx)
    .await?;
    // Un reenvío de la misma captura se encontraría a sí misma
    Ok(candidatos.into_iter().find(|c| c.id != propio))
}

fn es_duplicado(p: &Pendiente) -> bool {
    p.entidad == Entidad::Poi && p.reid.is_some()
}

async fn guardar(
    estado: &Estado,
    tx: &mut Tx<'_>,
    p: &Pendiente,
    ruta: Option<String>,
) -> ApiResult<(&'static str, Value)> {
    if es_duplicado(p) {
        let existente = p.reid.as_ref().map(|c| c.id).unwrap_or_default();
        let fila = leer_json(tx, Tabla::PuntosInteres, existente)
            .await?
            .ok_or(ApiError::NoEncontrado("POI duplicado no visible"))?;
        if fila["user_id"] != p.fila["user_id"] {
            sqlx::query(
                "insert into public.confirmaciones (entidad, registro_id, tipo) values ('poi', $1, 'vigente')",
            )
            .bind(existente)
            .execute(&mut **tx)
            .await?;
        }
        return Ok(("duplicado", sin_embedding(fila)));
    }

    let mut fila = p.fila.clone();
    fila["imagen_path"] = ruta.map_or(Value::Null, Value::String);
    if let Some(e) = &p.embedding {
        fila["embedding"] = Value::String(texto_vector(e));
    }
    if let (Entidad::Persona, Some(c)) = (p.entidad, &p.reid) {
        let identidad: Uuid = sqlx::query_scalar(
            "select coalesce(identidad_id, id) from public.personas where id = $1",
        )
        .bind(c.id)
        .fetch_one(&mut **tx)
        .await?;
        fila["identidad_id"] = Value::String(identidad.to_string());
        fila["nombre"] = Value::String(c.nombre.clone());
    }
    let (final_, _, nuevo) = aplicar_fila(estado, tx, p.tabla, p.id, &fila).await?;
    Ok((
        if nuevo { "creada" } else { "actualizada" },
        sin_embedding(final_),
    ))
}

async fn subir_imagen(
    estado: &Estado,
    sesion: &Sesion,
    ruta: &str,
    jpeg: Vec<u8>,
) -> Result<(), String> {
    let url = format!(
        "{}/object/capturas/{ruta}",
        estado.config.storage_url.trim_end_matches('/')
    );
    let r = estado
        .http
        .post(url)
        .header("apikey", &estado.config.anon_key)
        .bearer_auth(&sesion.token)
        .header("content-type", "image/jpeg")
        .header("x-upsert", "true")
        .body(jpeg)
        .send()
        .await
        .map_err(|e| format!("Storage: {e}"))?;
    if r.status().is_success() {
        Ok(())
    } else {
        let estado_http = r.status();
        Err(format!(
            "Storage {estado_http}: {}",
            r.text().await.unwrap_or_default()
        ))
    }
}

/// Avisa a las sesiones del usuario (la unidad de campo actualiza su contador).
fn publicar(estado: &Estado, sesion: &Sesion, p: &Procesada) {
    let mensaje = CapturaProcesada {
        id: uuid_a_bytes(p.id),
        entidad: match p.entidad {
            Entidad::Persona => ProtoEntidad::Persona,
            Entidad::Poi => ProtoEntidad::Poi,
            Entidad::Objeto => ProtoEntidad::Objeto,
        }
        .into(),
        nombre: p.fila["nombre"].as_str().unwrap_or_default().to_owned(),
        reid: p.reid.as_ref().map(|c| CoincidenciaReId {
            id: uuid_a_bytes(c.id),
            nombre: c.nombre.clone(),
            similitud: c.similitud as f32,
        }),
    };
    let envoltura = Emisor::default().envolver(mensaje, Utc::now().timestamp_millis());
    estado.difusor.publicar(
        sesion.user_id,
        Relevo {
            origen: None,
            clase: Clase::Otro,
            bytes: codificar(&envoltura),
        },
    );
}

fn texto_vector(e: &[f32]) -> String {
    let cuerpo: Vec<String> = e.iter().map(f32::to_string).collect();
    format!("[{}]", cuerpo.join(","))
}

fn sin_embedding(mut fila: Value) -> Value {
    if let Some(o) = fila.as_object_mut() {
        o.remove("embedding");
    }
    fila
}
