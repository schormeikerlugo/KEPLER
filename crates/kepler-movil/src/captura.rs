//! Capturas de campo con foto: objeto o persona (captura rápida) y POI
//! reportado. La fila se arma aquí (id UUIDv7 del dispositivo, metadatos de
//! sincronización) y el servidor hace el resto: Storage, CLIP y Re-ID.

use base64::Engine;
use chrono::{DateTime, Utc};
use serde_json::{Value, json};

use crate::ErrorKepler;

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum TipoCaptura {
    Objeto,
    Persona,
    Poi,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NuevaCaptura {
    pub tipo: TipoCaptura,
    pub nombre: String,
    /// Clase YOLO y confianza (objetos y personas detectados).
    pub clase: Option<String>,
    pub confianza: Option<f32>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub mision_id: Option<String>,
    /// POI: `bajo`, `medio`, `alto` o `critico`.
    pub nivel_riesgo: Option<String>,
    pub categoria_id: Option<String>,
    pub descripcion: Option<String>,
    /// POI: visible para los demás exploradores (avisos de peligro).
    pub compartir: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CapturaGuardada {
    pub id: String,
    /// `creada`, `actualizada` o `duplicado` (POI ya reportado).
    pub accion: String,
    pub imagen_path: Option<String>,
    /// Re-ID: con qué se identificó y cuánto se parece (0-1).
    pub coincide_con: Option<String>,
    pub similitud: Option<f64>,
    /// Resumen para mostrar al explorador.
    pub mensaje: String,
    /// Guardada en el dispositivo: se enviará al volver a la base.
    pub en_cola: bool,
}

pub(crate) fn cuerpo(c: &NuevaCaptura, jpeg: &[u8], ahora: DateTime<Utc>) -> Value {
    let mut fila = json!({
        "id": kepler_core::nuevo_id(),
        "nombre": c.nombre.trim(),
        "lat": c.lat,
        "lng": c.lng,
        "mision_id": c.mision_id,
        "capturado_en": ahora,
        "creado_en": ahora,
        "actualizado_en": ahora,
        "version": 1,
    });
    let entidad = match c.tipo {
        TipoCaptura::Objeto => {
            fila["clase_yolo"] = json!(c.clase);
            fila["confianza"] = json!(c.confianza);
            fila["descripcion"] = json!(c.descripcion);
            fila["atributos"] = json!({});
            fila["contexto_ambiental"] = json!({});
            "objeto"
        }
        TipoCaptura::Persona => {
            fila["confianza"] = json!(c.confianza);
            fila["rasgos_fisicos"] = json!(c.descripcion);
            "persona"
        }
        TipoCaptura::Poi => {
            fila["nivel_riesgo"] = json!(c.nivel_riesgo.as_deref().unwrap_or("medio"));
            fila["categoria_id"] = json!(c.categoria_id);
            fila["descripcion"] = json!(c.descripcion);
            fila["clase_yolo"] = json!(c.clase);
            fila["visibilidad"] = json!(if c.compartir { "compartido" } else { "privado" });
            fila["metadata"] = json!({});
            "poi"
        }
    };
    json!([{
        "entidad": entidad,
        "fila": fila,
        "imagen": base64::engine::general_purpose::STANDARD.encode(jpeg),
    }])
}

pub(crate) fn resultado(c: &NuevaCaptura, r: &Value) -> Result<CapturaGuardada, ErrorKepler> {
    if let Some(motivo) = r["rechazadas"][0]["motivo"].as_str() {
        return Err(ErrorKepler::Servidor {
            mensaje: format!("captura rechazada: {motivo}"),
        });
    }
    let p = &r["procesadas"][0];
    let accion = p["accion"].as_str().unwrap_or("creada").to_owned();
    let coincide_con = p["reid"]["nombre"].as_str().map(str::to_owned);
    let similitud = p["reid"]["similitud"].as_f64();
    let nombre = c.nombre.trim();
    let pct = similitud.map_or(0.0, |s| (s * 100.0).round());
    let mensaje = match (c.tipo, &coincide_con) {
        (TipoCaptura::Persona, Some(n)) => format!("Persona identificada: «{n}» ({pct} %)"),
        (TipoCaptura::Poi, Some(n)) => {
            format!("«{n}» ya estaba reportado: cuenta como confirmación")
        }
        (TipoCaptura::Objeto, Some(n)) => {
            format!("{nombre} guardado · se parece a «{n}» ({pct} %)")
        }
        (TipoCaptura::Poi, None) => format!("POI «{nombre}» reportado"),
        _ => format!("{nombre} guardado"),
    };
    Ok(CapturaGuardada {
        id: p["id"].as_str().unwrap_or_default().to_owned(),
        accion,
        imagen_path: p["imagen_path"].as_str().map(str::to_owned),
        coincide_con,
        similitud,
        mensaje,
        en_cola: false,
    })
}

/// Captura guardada en la cola (sin conexión).
pub(crate) fn en_cola(c: &NuevaCaptura, cuerpo: &Value) -> CapturaGuardada {
    CapturaGuardada {
        id: cuerpo[0]["fila"]["id"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        accion: "en_cola".into(),
        imagen_path: None,
        coincide_con: None,
        similitud: None,
        mensaje: format!(
            "{} guardado sin conexión · se enviará al volver a la base",
            c.nombre.trim()
        ),
        en_cola: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nueva(tipo: TipoCaptura) -> NuevaCaptura {
        NuevaCaptura {
            tipo,
            nombre: " Autobús ".into(),
            clase: Some("bus".into()),
            confianza: Some(0.9),
            lat: Some(10.5),
            lng: Some(-66.9),
            mision_id: None,
            nivel_riesgo: Some("alto".into()),
            categoria_id: None,
            descripcion: None,
            compartir: true,
        }
    }

    #[test]
    fn cuerpo_por_tipo() {
        let c = cuerpo(&nueva(TipoCaptura::Objeto), b"\xff\xd8", Utc::now());
        assert_eq!(
            (c[0]["entidad"].as_str(), c[0]["fila"]["nombre"].as_str()),
            (Some("objeto"), Some("Autobús"))
        );
        assert_eq!(c[0]["fila"]["clase_yolo"], "bus");
        assert_eq!(c[0]["imagen"], "/9g=");
        let p = cuerpo(&nueva(TipoCaptura::Poi), b"x", Utc::now());
        assert_eq!(
            (
                p[0]["entidad"].as_str(),
                p[0]["fila"]["visibilidad"].as_str()
            ),
            (Some("poi"), Some("compartido"))
        );
        assert!(
            cuerpo(&nueva(TipoCaptura::Persona), b"x", Utc::now())[0]["fila"]
                .get("clase_yolo")
                .is_none()
        );
    }

    #[test]
    fn resultado_con_reid_y_rechazo() {
        let r = json!({ "procesadas": [{ "id": "a", "accion": "creada", "reid": { "nombre": "Guardaparques", "similitud": 0.83 } }], "rechazadas": [] });
        let g = resultado(&nueva(TipoCaptura::Persona), &r).unwrap();
        assert_eq!(g.mensaje, "Persona identificada: «Guardaparques» (83 %)");
        let r = json!({ "procesadas": [], "rechazadas": [{ "indice": 0, "motivo": "imagen inválida" }] });
        assert!(resultado(&nueva(TipoCaptura::Objeto), &r).is_err());
    }
}
