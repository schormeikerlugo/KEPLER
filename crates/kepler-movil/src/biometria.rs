//! Biometría del explorador: muestras de Apple Salud, del barómetro del iPhone
//! y del reloj. Se guardan primero en el almacén local y `sync` las envía en
//! lotes a `POST /v1/biometria` (idempotente por id).

use chrono::{DateTime, Utc};
use kepler_cliente::Cliente;
use serde_json::{Value, json};

use crate::almacen::Almacen;

/// Muestras por petición (el servidor acepta hasta 2000).
pub const LOTE: usize = 1000;

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MuestraBio {
    /// UUID (el de la muestra de Salud, si viene de ahí).
    pub id: String,
    /// pasos, distancia, energia_activa, pulso, spo2, vfc, sueno, animo, presion, altitud…
    pub tipo: String,
    pub valor: f64,
    pub unidad: String,
    /// Segundos Unix.
    pub inicio: f64,
    pub fin: f64,
    pub fuente: Option<String>,
    /// JSON con detalles (p. ej. `{"fase":"profundo"}`).
    pub detalle: Option<String>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ResumenBio {
    pub tipo: String,
    pub unidad: String,
    pub ultimo: Option<f64>,
    /// Segundos Unix.
    pub ultimo_en: i64,
    pub fuente: Option<String>,
    pub muestras: u32,
    pub media: Option<f64>,
    pub minimo: Option<f64>,
    pub maximo: Option<f64>,
    /// Acumulables (pasos, distancia…): total de hoy.
    pub hoy: Option<f64>,
    /// Las estadísticas son totales por día.
    pub por_dia: bool,
}

fn fecha(s: f64) -> Option<String> {
    let ms = (s * 1000.0).round() as i64;
    DateTime::<Utc>::from_timestamp_millis(ms).map(|d| d.to_rfc3339())
}

/// Cuerpo para el servidor; `None` si la muestra no es válida.
pub fn cuerpo(m: &MuestraBio) -> Option<Value> {
    uuid::Uuid::parse_str(&m.id).ok()?;
    if !m.valor.is_finite() || m.fin < m.inicio {
        return None;
    }
    let detalle = m
        .detalle
        .as_deref()
        .and_then(|d| serde_json::from_str::<Value>(d).ok());
    Some(json!({
        "id": m.id, "tipo": m.tipo, "valor": m.valor, "unidad": m.unidad,
        "inicio": fecha(m.inicio)?, "fin": fecha(m.fin)?, "fuente": m.fuente, "detalle": detalle,
    }))
}

/// Guarda en el almacén las muestras válidas; devuelve cuántas.
pub fn guardar(a: &Almacen, muestras: &[MuestraBio]) -> rusqlite::Result<u32> {
    let validas: Vec<(String, Value)> = muestras
        .iter()
        .filter_map(|m| Some((m.id.clone(), cuerpo(m)?)))
        .collect();
    a.guardar_biometria(&validas)?;
    Ok(validas.len() as u32)
}

/// Envía todo lo pendiente, por lotes.
pub async fn enviar(a: &Almacen, c: &Cliente) -> Result<(), kepler_cliente::Error> {
    loop {
        let lote = a.biometria_sin_enviar(LOTE).unwrap_or_default();
        if lote.is_empty() {
            return Ok(());
        }
        let ids: Vec<String> = lote.iter().map(|(id, _)| id.clone()).collect();
        let cuerpo = Value::Array(lote.into_iter().map(|(_, v)| v).collect());
        match c.post::<Value>("/v1/biometria", &cuerpo).await {
            Ok(_) => {
                let _ = a.marcar_biometria(&ids);
            }
            // Lote rechazado (muestra inválida): no se arregla reenviando
            Err(e) if e.codigo() == Some(422) || e.codigo() == Some(400) => {
                let _ = a.marcar_biometria(&ids);
            }
            Err(e) => return Err(e),
        }
    }
}

/// `GET /v1/biometria/resumen` → filas ordenadas por tipo.
pub fn resumen(v: &Value) -> Vec<ResumenBio> {
    let mut filas: Vec<ResumenBio> = v["tipos"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(tipo, t)| ResumenBio {
            tipo: tipo.clone(),
            unidad: t["unidad"].as_str().unwrap_or_default().to_owned(),
            ultimo: t["ultimo"].as_f64(),
            ultimo_en: crate::archivo::segundos(&t["ultimo_en"]),
            fuente: t["fuente"].as_str().map(str::to_owned),
            muestras: t["muestras"].as_u64().unwrap_or(0) as u32,
            media: t["media"].as_f64(),
            minimo: t["minimo"].as_f64(),
            maximo: t["maximo"].as_f64(),
            hoy: t["hoy"].as_f64(),
            por_dia: t["por_dia"].as_bool().unwrap_or(false),
        })
        .collect();
    filas.sort_by(|a, b| a.tipo.cmp(&b.tipo));
    filas
}

#[cfg(test)]
mod tests {
    use super::*;

    fn muestra(id: &str, valor: f64) -> MuestraBio {
        MuestraBio {
            id: id.into(),
            tipo: "pulso".into(),
            valor,
            unidad: "lpm".into(),
            inicio: 1_793_000_000.5,
            fin: 1_793_000_000.5,
            fuente: Some("Carbinox Max".into()),
            detalle: Some(r#"{"fase":"profundo"}"#.into()),
        }
    }

    #[test]
    fn valida_y_guarda_una_vez() {
        let a = Almacen::en_memoria();
        let id = "0195f3a0-0000-7000-8000-000000000001";
        let n = guardar(
            &a,
            &[
                muestra(id, 72.0),
                muestra("no-uuid", 70.0),
                muestra(id, 72.0),
            ],
        )
        .unwrap();
        assert_eq!(n, 2);
        assert_eq!(a.biometria_pendiente(), 1);
        let lote = a.biometria_sin_enviar(10).unwrap();
        assert_eq!(lote[0].1["inicio"], "2026-10-26T07:33:20.500+00:00");
        assert_eq!(lote[0].1["detalle"]["fase"], "profundo");
        a.marcar_biometria(&[id.into()]).unwrap();
        assert_eq!(a.biometria_pendiente(), 0);
        assert!(cuerpo(&muestra(id, f64::NAN)).is_none());
    }

    #[test]
    fn resumen_ordenado() {
        let v = json!({ "tipos": {
            "spo2": { "unidad": "%", "ultimo": 97.0, "ultimo_en": "2026-11-02T20:00:00Z", "muestras": 3 },
            "pasos": { "unidad": "pasos", "ultimo": 400.0, "hoy": 4000.0, "por_dia": true, "muestras": 2 }
        } });
        let r = resumen(&v);
        assert_eq!(r[0].tipo, "pasos");
        assert_eq!(r[0].hoy, Some(4000.0));
        assert_eq!(r[1].ultimo, Some(97.0));
        assert!(r[1].ultimo_en > 0);
    }
}
