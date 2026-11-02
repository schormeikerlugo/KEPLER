//! Trabajo de campo sin depender de la red: misión en curso, rastro GPS y
//! sincronización de la cola con el servidor.
//!
//! Orden de envío: la cola va en orden (crear misión → capturas → cerrar); el
//! rastro de una misión se envía antes de cerrarla (el servidor calcula
//! distancia y duración al completar) y el resto al final de cada ronda.
//! Reenviar es seguro: capturas y puntos llevan id del dispositivo y la
//! misión ya creada responde 409.

use chrono::{DateTime, Utc};
use kepler_cliente::{Cliente, Error as ErrorCliente};
use kepler_core::Coordenada;
use serde_json::{Value, json};

use crate::almacen::{Almacen, Clase, Punto};

/// Puntos con peor precisión se descartan.
pub const PRECISION_MAX_M: f64 = 50.0;
/// Un salto mayor entre dos puntos seguidos es un error del GPS: no suma distancia.
const SALTO_MAX_M: f64 = 500.0;
const LOTE_RASTRO: usize = 500;
const CLAVE_MISION: &str = "mision";

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MisionEnCurso {
    pub id: String,
    pub titulo: String,
    /// Código del servidor (`None` mientras su creación espera en la cola).
    pub codigo: Option<String>,
    /// Segundos Unix.
    pub inicio_en: i64,
    /// Distancia aproximada en el dispositivo (la buena la calcula el servidor al cerrar).
    pub distancia_m: f64,
    pub puntos: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PuntoGps {
    pub lat: f64,
    pub lng: f64,
    pub altitud: Option<f64>,
    pub velocidad: Option<f64>,
    pub rumbo: Option<f64>,
    pub precision_m: Option<f64>,
    /// Segundos Unix (con decimales).
    pub en: f64,
}

#[derive(Debug, Clone, Default, PartialEq, uniffi::Record)]
pub struct EstadoSync {
    /// Peticiones en cola (misiones, capturas).
    pub pendientes: u32,
    /// Puntos GPS por enviar.
    pub rastro: u32,
    /// Rechazadas varias veces por el servidor: apartadas para no bloquear.
    pub apartadas: u32,
    pub en_linea: bool,
    pub ultimo_error: Option<String>,
}

// --- misión en curso -----------------------------------------------------------

pub fn mision(a: &Almacen) -> Option<MisionEnCurso> {
    let v = a.leer(CLAVE_MISION)?;
    Some(MisionEnCurso {
        id: v["id"].as_str()?.to_owned(),
        titulo: v["titulo"].as_str().unwrap_or("Misión").to_owned(),
        codigo: v["codigo"].as_str().map(str::to_owned),
        inicio_en: v["inicio_en"].as_i64().unwrap_or(0),
        distancia_m: v["distancia_m"].as_f64().unwrap_or(0.0),
        puntos: u32::try_from(v["puntos"].as_u64().unwrap_or(0)).unwrap_or(u32::MAX),
    })
}

fn guardar_mision(
    a: &Almacen,
    m: &MisionEnCurso,
    ultimo: Option<(f64, f64)>,
) -> rusqlite::Result<()> {
    a.escribir(
        CLAVE_MISION,
        Some(&json!({
            "id": m.id, "titulo": m.titulo, "codigo": m.codigo, "inicio_en": m.inicio_en,
            "distancia_m": m.distancia_m, "puntos": m.puntos, "ultimo": ultimo.map(|(la, lo)| [la, lo]),
        })),
    )
}

/// Crea e inicia una misión en el dispositivo; la creación queda en la cola.
pub fn iniciar(
    a: &Almacen,
    titulo: &str,
    lat: Option<f64>,
    lng: Option<f64>,
    ahora: DateTime<Utc>,
) -> rusqlite::Result<MisionEnCurso> {
    let id = kepler_core::nuevo_id().to_string();
    let cuerpo =
        json!({ "id": id, "titulo": titulo, "iniciar": true, "lat": lat, "lng": lng, "en": ahora });
    a.encolar(Clase::CrearMision, "/v1/misiones", &cuerpo, Some(&id))?;
    let m = MisionEnCurso {
        id,
        titulo: titulo.to_owned(),
        codigo: None,
        inicio_en: ahora.timestamp(),
        distancia_m: 0.0,
        puntos: 0,
    };
    guardar_mision(a, &m, lat.zip(lng))?;
    Ok(m)
}

/// Adopta como en curso una misión activa del servidor (iniciada en otro dispositivo).
pub fn adoptar(a: &Almacen, m: &Value) -> rusqlite::Result<Option<MisionEnCurso>> {
    let Some(id) = m["id"].as_str() else {
        return Ok(None);
    };
    let codigo = m["codigo"].as_str().map(str::to_owned);
    let en = MisionEnCurso {
        id: id.to_owned(),
        titulo: m["titulo"]
            .as_str()
            .filter(|t| !t.is_empty())
            .map(str::to_owned)
            .or_else(|| codigo.clone())
            .unwrap_or_else(|| "Misión".into()),
        codigo,
        inicio_en: m["inicio_en"]
            .as_str()
            .and_then(|s| s.parse::<DateTime<Utc>>().ok())
            .map_or(0, |d| d.timestamp()),
        distancia_m: m["distancia_m"].as_f64().unwrap_or(0.0),
        puntos: 0,
    };
    guardar_mision(a, &en, None)?;
    Ok(Some(en))
}

/// Cierra la misión en curso (completar o abortar); el cierre queda en la cola.
pub fn terminar(
    a: &Almacen,
    completar: bool,
    ahora: DateTime<Utc>,
) -> rusqlite::Result<Option<MisionEnCurso>> {
    let Some(m) = mision(a) else { return Ok(None) };
    let accion = if completar { "completar" } else { "abortar" };
    a.encolar(
        Clase::Transicion,
        &format!("/v1/misiones/{}/{accion}", m.id),
        &json!({ "en": ahora }),
        Some(&m.id),
    )?;
    a.escribir(CLAVE_MISION, None)?;
    Ok(Some(m))
}

/// Guarda un punto de la misión en curso y actualiza la distancia aproximada.
pub fn registrar(a: &Almacen, p: &PuntoGps) -> rusqlite::Result<Option<MisionEnCurso>> {
    let Some(v) = a.leer(CLAVE_MISION) else {
        return Ok(None);
    };
    let Some(mut m) = mision(a) else {
        return Ok(None);
    };
    if p.precision_m.is_some_and(|e| e > PRECISION_MAX_M) || Coordenada::new(p.lat, p.lng).is_err()
    {
        return Ok(Some(m));
    }
    let en =
        DateTime::<Utc>::from_timestamp_millis((p.en * 1000.0) as i64).unwrap_or_else(Utc::now);
    a.guardar_punto(
        &m.id,
        &Punto {
            id: kepler_core::nuevo_id().to_string(),
            lat: p.lat,
            lng: p.lng,
            altitud: p.altitud,
            velocidad: p.velocidad,
            rumbo: p.rumbo,
            precision_m: p.precision_m,
            registrado_en: en.to_rfc3339(),
        },
    )?;
    if let (Some(la), Some(lo)) = (v["ultimo"][0].as_f64(), v["ultimo"][1].as_f64())
        && let (Ok(antes), Ok(ahora)) = (Coordenada::new(la, lo), Coordenada::new(p.lat, p.lng))
    {
        let d = antes.distancia_m(&ahora);
        if d < SALTO_MAX_M {
            m.distancia_m += d;
        }
    }
    m.puntos += 1;
    guardar_mision(a, &m, Some((p.lat, p.lng)))?;
    Ok(Some(m))
}

// --- sincronización ----------------------------------------------------------------

pub fn estado(a: &Almacen, en_linea: bool, ultimo_error: Option<String>) -> EstadoSync {
    EstadoSync {
        pendientes: a.pendientes(),
        rastro: a.rastro_pendiente(),
        apartadas: a.apartadas(),
        en_linea,
        ultimo_error,
    }
}

/// Una ronda: la cola en orden y luego el rastro. Se para al primer error de red.
pub async fn sincronizar(a: &Almacen, c: &Cliente) -> EstadoSync {
    match ronda(a, c).await {
        Ok(()) => {
            reconciliar(a, c).await;
            estado(a, true, None)
        }
        Err(Parada::Red(e)) => estado(a, false, Some(e)),
        Err(Parada::Otra(e)) => estado(a, true, Some(e)),
    }
}

enum Parada {
    Red(String),
    Otra(String),
}

impl From<ErrorCliente> for Parada {
    fn from(e: ErrorCliente) -> Self {
        match e {
            ErrorCliente::Red(_) => Self::Red(e.to_string()),
            otro => Self::Otra(otro.to_string()),
        }
    }
}

impl From<rusqlite::Error> for Parada {
    fn from(e: rusqlite::Error) -> Self {
        Self::Otra(format!("almacén: {e}"))
    }
}

async fn ronda(a: &Almacen, c: &Cliente) -> Result<(), Parada> {
    while let Some(p) = a.siguiente()? {
        if p.clase == Clase::Transicion
            && let Some(m) = &p.mision
        {
            enviar_rastro(a, c, m).await?;
        }
        match c.post::<Value>(&p.ruta, &p.cuerpo).await {
            // Las capturas rechazadas (foto inválida…) no se arreglan reenviando
            Ok(_) => a.quitar(p.seq)?,
            Err(e @ (ErrorCliente::Red(_) | ErrorCliente::NoAutorizado(_))) => return Err(e.into()),
            Err(e) => {
                let hecho = match (p.clase, e.codigo()) {
                    // Ya creada en un envío anterior que no llegó a confirmarse
                    (Clase::CrearMision, Some(409)) => true,
                    // Si ya no está activa, el cierre ya se hizo (o se cerró en otro sitio)
                    (Clase::Transicion, Some(409 | 422)) => match &p.mision {
                        Some(m) => c
                            .get::<Value>(&format!("/v1/misiones/{m}"))
                            .await
                            .is_ok_and(|v| v["estado"] != "activa"),
                        None => true,
                    },
                    _ => false,
                };
                if hecho {
                    a.quitar(p.seq)?;
                } else {
                    a.fallo(p.seq, &e.to_string())?;
                    if e.codigo().is_some_and(|c| c >= 500) {
                        return Err(e.into());
                    }
                }
            }
        }
    }
    for m in a.misiones_con_rastro()? {
        if !a.mision_por_crear(&m) {
            enviar_rastro(a, c, &m).await?;
        }
    }
    Ok(())
}

async fn enviar_rastro(a: &Almacen, c: &Cliente, mision: &str) -> Result<(), Parada> {
    loop {
        let puntos = a.puntos_sin_enviar(mision, LOTE_RASTRO)?;
        if puntos.is_empty() {
            return Ok(());
        }
        let cuerpo: Vec<Value> = puntos
            .iter()
            .map(|p| {
                json!({ "id": p.id, "lat": p.lat, "lng": p.lng, "altitud": p.altitud, "velocidad": p.velocidad,
                        "rumbo": p.rumbo, "precision_m": p.precision_m, "registrado_en": p.registrado_en })
            })
            .collect();
        let ids: Vec<String> = puntos.into_iter().map(|p| p.id).collect();
        match c
            .post::<Value>(
                &format!("/v1/misiones/{mision}/rastro"),
                &Value::Array(cuerpo),
            )
            .await
        {
            Ok(_) => a.marcar_enviados(&ids)?,
            // La misión no existe (borrada): esos puntos ya no tienen dónde ir
            Err(e) if e.codigo() == Some(404) => {
                a.marcar_enviados(&ids)?;
                return Ok(());
            }
            Err(e) => return Err(e.into()),
        }
    }
}

/// La misión en curso se cerró en otro dispositivo: deja de registrarla.
async fn reconciliar(a: &Almacen, c: &Cliente) {
    let Some(m) = mision(a) else { return };
    if a.mision_por_crear(&m.id) {
        return;
    }
    if let Ok(v) = c.get::<Value>(&format!("/v1/misiones/{}", m.id)).await {
        if v["estado"] != "activa" {
            let _ = a.escribir(CLAVE_MISION, None);
        } else if m.codigo.is_none() {
            // Ya creada: guardar el código del servidor
            let mut con_codigo = m.clone();
            con_codigo.codigo = v["codigo"].as_str().map(str::to_owned);
            let ultimo = a
                .leer(CLAVE_MISION)
                .and_then(|u| Some((u["ultimo"][0].as_f64()?, u["ultimo"][1].as_f64()?)));
            let _ = guardar_mision(a, &con_codigo, ultimo);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn punto(lat: f64, en: f64, precision: f64) -> PuntoGps {
        PuntoGps {
            lat,
            lng: -66.9,
            altitud: None,
            velocidad: None,
            rumbo: None,
            precision_m: Some(precision),
            en,
        }
    }

    #[test]
    fn mision_local_con_rastro_y_cierre_en_cola() {
        let a = Almacen::en_memoria();
        let ahora = Utc::now();
        let m = iniciar(&a, "Ronda", Some(10.5), Some(-66.9), ahora).unwrap();
        assert!(a.mision_por_crear(&m.id));
        // 0.001° de latitud ≈ 111 m
        let m2 = registrar(&a, &punto(10.501, 1.0e9, 5.0)).unwrap().unwrap();
        assert!((m2.distancia_m - 111.2).abs() < 1.0, "{}", m2.distancia_m);
        // Impreciso: se ignora; salto enorme: se guarda pero no suma
        registrar(&a, &punto(10.6, 1.0e9 + 1.0, 80.0)).unwrap();
        let m3 = registrar(&a, &punto(10.6, 1.0e9 + 2.0, 5.0))
            .unwrap()
            .unwrap();
        assert_eq!(
            (m3.puntos, (m3.distancia_m - m2.distancia_m).abs() < 1e-9),
            (2, true)
        );
        assert_eq!(a.rastro_pendiente(), 2);
        terminar(&a, true, ahora).unwrap();
        assert!(mision(&a).is_none());
        assert_eq!(a.pendientes(), 2);
        let crear = a.siguiente().unwrap().unwrap();
        assert_eq!(crear.cuerpo["iniciar"], true);
        a.quitar(crear.seq).unwrap();
        let cierre = a.siguiente().unwrap().unwrap();
        assert_eq!(cierre.ruta, format!("/v1/misiones/{}/completar", m.id));
        assert!(
            registrar(&a, &punto(10.5, 1.0, 5.0)).unwrap().is_none(),
            "sin misión no se registra"
        );
    }

    #[test]
    fn adopta_una_mision_del_servidor() {
        let a = Almacen::en_memoria();
        let m = adoptar(&a, &json!({ "id": "x", "codigo": "MISION-1", "titulo": "", "inicio_en": "2026-11-01T10:00:00Z" }))
            .unwrap()
            .unwrap();
        assert_eq!(
            (m.titulo.as_str(), m.codigo.as_deref()),
            ("MISION-1", Some("MISION-1"))
        );
        assert_eq!(mision(&a), Some(m));
    }
}
