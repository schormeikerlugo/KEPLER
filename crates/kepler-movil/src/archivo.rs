//! Archivos (hallazgos propios), comparador de identidades y bitácora. Necesitan
//! el servidor: es la revisión que se hace en la base.
//!
//! Las ediciones suben la fila completa con la versión siguiente por
//! `/v1/sync/subir`, como el Centro de Control: si otro dispositivo la cambió
//! antes, gana el servidor y se avisa.

use chrono::{DateTime, Utc};
use serde_json::{Value, json};

use crate::ErrorKepler;

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum TipoHallazgo {
    Objetos,
    Personas,
    PuntosInteres,
}

impl TipoHallazgo {
    pub fn tabla(self) -> &'static str {
        match self {
            Self::Objetos => "objetos",
            Self::Personas => "personas",
            Self::PuntosInteres => "puntos_interes",
        }
    }
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Hallazgo {
    pub id: String,
    pub tipo: TipoHallazgo,
    pub nombre: String,
    /// Hostilidad (personas), nivel de riesgo (POIs) o clase YOLO (objetos).
    pub nivel: String,
    /// Descripción (objetos, POIs) o rasgos físicos (personas).
    pub texto: String,
    /// Personas: notas.
    pub notas: String,
    pub imagen_path: Option<String>,
    pub capturado_en: i64,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub mision_id: Option<String>,
    pub confianza: Option<f32>,
    pub distancia_m: Option<f32>,
    /// Visible para otros exploradores (objetos y POIs).
    pub compartido: bool,
    /// Personas: vinculada a otra identidad (comparador).
    pub vinculada: bool,
    pub etiquetas: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PaginaHallazgos {
    pub items: Vec<Hallazgo>,
    pub hay_mas: bool,
}

/// Cambios desde el detalle.
#[derive(Debug, Clone, uniffi::Record)]
pub struct EdicionHallazgo {
    pub tipo: TipoHallazgo,
    pub id: String,
    pub nombre: String,
    pub texto: String,
    pub notas: String,
    pub nivel: String,
    pub compartido: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Candidato {
    pub id: String,
    pub nombre: String,
    pub imagen_path: Option<String>,
    pub similitud: f64,
    pub capturado_en: i64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct IdentidadPendiente {
    pub id: String,
    pub nombre: String,
    pub imagen_path: Option<String>,
    pub rasgos: String,
    pub capturado_en: i64,
    pub candidatos: Vec<Candidato>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct EntradaBitacora {
    pub id: String,
    /// `info`, `success`, `warning`, `critical`.
    pub tipo: String,
    pub mensaje: String,
    pub leida: bool,
    pub creado_en: i64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PaginaBitacora {
    pub items: Vec<EntradaBitacora>,
    pub no_leidas: u32,
}

pub fn hallazgo(tipo: TipoHallazgo, v: &Value) -> Hallazgo {
    let t = |k: &str| v[k].as_str().unwrap_or_default().to_owned();
    let (nivel, texto) = match tipo {
        TipoHallazgo::Personas => (t("hostilidad"), t("rasgos_fisicos")),
        TipoHallazgo::PuntosInteres => (t("nivel_riesgo"), t("descripcion")),
        TipoHallazgo::Objetos => (t("clase_yolo"), t("descripcion")),
    };
    Hallazgo {
        id: t("id"),
        tipo,
        nombre: t("nombre"),
        nivel,
        texto,
        notas: t("notas"),
        imagen_path: v["imagen_path"].as_str().map(str::to_owned),
        capturado_en: segundos(&v["capturado_en"]),
        lat: v["lat"].as_f64(),
        lng: v["lng"].as_f64(),
        mision_id: v["mision_id"].as_str().map(str::to_owned),
        confianza: v["confianza"].as_f64().map(|c| c as f32),
        distancia_m: v["distancia_m"].as_f64().map(|d| d as f32),
        compartido: v["visibilidad"] == "compartido",
        vinculada: !v["identidad_id"].is_null(),
        etiquetas: v["etiquetas"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|e| e["nombre"].as_str().map(str::to_owned))
            .collect(),
    }
}

/// Ruta del listado (`antes`: capturado_en del último de la página anterior).
pub fn ruta_listado(
    tipo: TipoHallazgo,
    q: Option<&str>,
    mision: Option<&str>,
    antes: Option<i64>,
) -> String {
    let mut r = format!("/v1/archivos?tipo={}&limite=40", tipo.tabla());
    if let Some(q) = q.map(str::trim).filter(|q| !q.is_empty()) {
        r.push_str(&format!("&q={}", codificar(q)));
    }
    if let Some(m) = mision {
        r.push_str(&format!("&mision={m}"));
    }
    if let Some(t) = antes.and_then(|s| DateTime::<Utc>::from_timestamp(s, 0)) {
        r.push_str(&format!("&antes={}", codificar(&t.to_rfc3339())));
    }
    r
}

/// Aplica la edición a la fila completa del servidor y la prepara para subir.
pub fn fila_editada(original: &Value, e: &EdicionHallazgo, ahora: DateTime<Utc>) -> Value {
    let mut f = original.clone();
    let opcional = |s: &str| {
        let s = s.trim();
        if s.is_empty() { Value::Null } else { json!(s) }
    };
    f["nombre"] = json!(e.nombre.trim());
    let visibilidad = if e.compartido {
        "compartido"
    } else {
        "privado"
    };
    match e.tipo {
        TipoHallazgo::Personas => {
            f["rasgos_fisicos"] = opcional(&e.texto);
            f["notas"] = opcional(&e.notas);
            f["hostilidad"] = json!(e.nivel);
        }
        TipoHallazgo::PuntosInteres => {
            f["descripcion"] = opcional(&e.texto);
            f["nivel_riesgo"] = json!(e.nivel);
            f["visibilidad"] = json!(visibilidad);
        }
        TipoHallazgo::Objetos => {
            f["descripcion"] = opcional(&e.texto);
            f["visibilidad"] = json!(visibilidad);
        }
    }
    para_subir(f, ahora)
}

/// Borrado lógico (se propaga por sync).
pub fn fila_borrada(original: &Value, ahora: DateTime<Utc>) -> Value {
    let mut f = original.clone();
    f["eliminado_en"] = json!(ahora);
    para_subir(f, ahora)
}

fn para_subir(mut f: Value, ahora: DateTime<Utc>) -> Value {
    f["version"] = json!(f["version"].as_i64().unwrap_or(1) + 1);
    f["actualizado_en"] = json!(ahora);
    if let Some(o) = f.as_object_mut() {
        // Campos calculados por el listado, no columnas de la tabla
        o.remove("tiene_embedding");
        o.remove("etiquetas");
    }
    f
}

/// Respuesta de `/v1/sync/subir` → la fila final o un error para el explorador.
pub fn resultado_subida(tipo: TipoHallazgo, r: &Value) -> Result<Value, ErrorKepler> {
    let error = |m: String| ErrorKepler::Servidor { mensaje: m };
    if let Some(m) = r["rechazados"][0]["motivo"].as_str() {
        return Err(error(format!("Rechazado: {m}")));
    }
    if r["conflictos"][0]["ganador"] == "servidor" {
        return Err(error(
            "Otro dispositivo lo cambió antes: recarga y vuelve a intentarlo".into(),
        ));
    }
    r["aplicados"][tipo.tabla()][0]
        .as_object()
        .cloned()
        .map(Value::Object)
        .ok_or_else(|| error("respuesta inesperada del servidor".into()))
}

pub fn identidad(v: &Value) -> IdentidadPendiente {
    let t = |x: &Value, k: &str| x[k].as_str().unwrap_or_default().to_owned();
    IdentidadPendiente {
        id: t(v, "id"),
        nombre: t(v, "nombre"),
        imagen_path: v["imagen_path"].as_str().map(str::to_owned),
        rasgos: t(v, "rasgos_fisicos"),
        capturado_en: segundos(&v["capturado_en"]),
        candidatos: v["candidatos"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|c| Candidato {
                id: t(c, "id"),
                nombre: t(c, "nombre"),
                imagen_path: c["imagen_path"].as_str().map(str::to_owned),
                similitud: c["similitud"].as_f64().unwrap_or(0.0),
                capturado_en: segundos(&c["capturado_en"]),
            })
            .collect(),
    }
}

pub fn entrada(v: &Value) -> EntradaBitacora {
    let t = |k: &str| v[k].as_str().unwrap_or_default().to_owned();
    EntradaBitacora {
        id: t("id"),
        tipo: t("tipo"),
        mensaje: t("mensaje"),
        leida: v["leida"] == true,
        creado_en: segundos(&v["creado_en"]),
    }
}

pub fn segundos(v: &Value) -> i64 {
    v.as_str()
        .and_then(|s| s.parse::<DateTime<Utc>>().ok())
        .map_or(0, |d| d.timestamp())
}

/// Codificación de URL para la consulta (sin dependencias).
fn codificar(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hallazgo_y_edicion() {
        let fila = json!({ "id": "p", "nombre": "X", "hostilidad": "desconocido", "rasgos_fisicos": null,
                           "identidad_id": "q", "version": 3, "tiene_embedding": true,
                           "capturado_en": "2026-11-01T10:00:00Z" });
        let h = hallazgo(TipoHallazgo::Personas, &fila);
        assert_eq!(
            (h.nivel.as_str(), h.vinculada, h.capturado_en),
            ("desconocido", true, 1_793_527_200)
        );
        let e = EdicionHallazgo {
            tipo: TipoHallazgo::Personas,
            id: "p".into(),
            nombre: " Guía ".into(),
            texto: "Gorra roja".into(),
            notas: " ".into(),
            nivel: "aliado".into(),
            compartido: false,
        };
        let f = fila_editada(&fila, &e, Utc::now());
        assert_eq!(
            (
                f["nombre"].as_str(),
                f["hostilidad"].as_str(),
                f["version"].as_i64()
            ),
            (Some("Guía"), Some("aliado"), Some(4))
        );
        assert!(f["notas"].is_null() && f.get("tiene_embedding").is_none());
        assert_eq!(fila_borrada(&fila, Utc::now())["version"], 4);
    }

    #[test]
    fn subida_conflicto_y_ruta() {
        let r =
            json!({ "aplicados": {}, "conflictos": [{ "ganador": "servidor" }], "rechazados": [] });
        assert!(resultado_subida(TipoHallazgo::Objetos, &r).is_err());
        let r = json!({ "aplicados": { "objetos": [{ "id": "o" }] }, "conflictos": [], "rechazados": [] });
        assert_eq!(
            resultado_subida(TipoHallazgo::Objetos, &r).unwrap()["id"],
            "o"
        );
        assert_eq!(
            ruta_listado(TipoHallazgo::PuntosInteres, Some("paso ñ"), None, Some(0)),
            "/v1/archivos?tipo=puntos_interes&limite=40&q=paso%20%C3%B1&antes=1970-01-01T00%3A00%3A00%2B00%3A00"
        );
    }
}
