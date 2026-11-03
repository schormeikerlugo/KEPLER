//! Preparación del explorador y rendimiento por misión (F8): conversión de las
//! respuestas del servidor a registros para Swift.

use serde_json::{Value, json};

#[derive(Debug, Clone, Default, PartialEq, uniffi::Record)]
pub struct PerfilFisicoMovil {
    pub edad: Option<u8>,
    pub peso_kg: Option<f64>,
    pub altura_cm: Option<f64>,
    /// `hombre` o `mujer`.
    pub sexo: Option<String>,
    pub fc_max: Option<u16>,
    pub fc_reposo: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct FactorPreparacion {
    pub clave: String,
    pub nombre: String,
    pub texto: String,
    pub puntos: f64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct DiaSalud {
    /// `AAAA-MM-DD` (hora local).
    pub fecha: String,
    pub sueno_h: Option<f64>,
    pub pulso_reposo: Option<f64>,
    pub estres: Option<f64>,
    pub pasos: Option<f64>,
    pub carga: f64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct EstadoFisico {
    /// 0–100.
    pub puntuacion: u8,
    /// `alta`, `media` o `baja`.
    pub nivel: String,
    pub resumen: String,
    pub factores: Vec<FactorPreparacion>,
    /// Hay historial suficiente para compararte contigo mismo.
    pub linea_base: bool,
    pub fc_max: u16,
    pub fc_reposo: u16,
    pub fc_max_estimada: bool,
    /// Límite inferior (lpm) de las zonas 1–5.
    pub zonas: Vec<u16>,
    /// Últimos 14 días, el más antiguo primero.
    pub dias: Vec<DiaSalud>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct RendimientoMision {
    pub mision_id: String,
    pub codigo: String,
    pub titulo: Option<String>,
    /// Segundos Unix.
    pub inicio: i64,
    pub distancia_km: f64,
    pub duracion_min: f64,
    pub desnivel_pos_m: f64,
    pub fc_media: Option<f64>,
    pub fc_max: Option<f64>,
    /// Minutos por debajo de la zona 1 y en las zonas 1–5.
    pub zonas_min: Vec<f64>,
    pub trimp: f64,
    pub spo2_min: Option<f64>,
    /// Preparación al salir (0–100).
    pub preparacion: Option<u8>,
    /// Esfuerzo percibido 1–10 (valoración del explorador).
    pub esfuerzo: Option<u8>,
    pub sensacion: Option<String>,
}

pub fn fisico(v: &Value) -> PerfilFisicoMovil {
    let f = &v["fisico"];
    PerfilFisicoMovil {
        edad: f["edad"].as_u64().map(|x| x as u8),
        peso_kg: f["peso_kg"].as_f64(),
        altura_cm: f["altura_cm"].as_f64(),
        sexo: f["sexo"].as_str().map(str::to_owned),
        fc_max: f["fc_max"].as_u64().map(|x| x as u16),
        fc_reposo: f["fc_reposo"].as_u64().map(|x| x as u16),
    }
}

/// Cuerpo de `PATCH /v1/yo` con el perfil físico (valores fuera de rango, fuera).
pub fn cuerpo_fisico(f: &PerfilFisicoMovil) -> Value {
    let rango = |v: Option<f64>, min: f64, max: f64| v.filter(|x| (min..=max).contains(x));
    json!({ "fisico": {
        "edad": f.edad.filter(|e| (10..=100).contains(e)),
        "peso_kg": rango(f.peso_kg, 25.0, 250.0),
        "altura_cm": rango(f.altura_cm, 100.0, 230.0),
        "sexo": f.sexo.as_deref().filter(|s| matches!(*s, "hombre" | "mujer")),
        "fc_max": f.fc_max.filter(|x| (120..=230).contains(x)),
        "fc_reposo": f.fc_reposo.filter(|x| (30..=110).contains(x)),
    } })
}

pub fn estado(v: &Value) -> EstadoFisico {
    let p = &v["preparacion"];
    EstadoFisico {
        puntuacion: p["puntuacion"].as_u64().unwrap_or(0) as u8,
        nivel: p["nivel"].as_str().unwrap_or("media").to_owned(),
        resumen: p["resumen"].as_str().unwrap_or_default().to_owned(),
        factores: p["factores"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|f| FactorPreparacion {
                clave: f["clave"].as_str().unwrap_or_default().to_owned(),
                nombre: f["nombre"].as_str().unwrap_or_default().to_owned(),
                texto: f["texto"].as_str().unwrap_or_default().to_owned(),
                puntos: f["puntos"].as_f64().unwrap_or(0.0),
            })
            .collect(),
        linea_base: p["linea_base"].as_bool().unwrap_or(false),
        fc_max: v["pulsos"]["maximo"].as_f64().unwrap_or(190.0) as u16,
        fc_reposo: v["pulsos"]["reposo"].as_f64().unwrap_or(60.0) as u16,
        fc_max_estimada: v["pulsos"]["maximo_estimado"].as_bool().unwrap_or(true),
        zonas: v["pulsos"]["zonas"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|z| z.as_u64().map(|x| x as u16))
            .collect(),
        dias: v["dias"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|d| DiaSalud {
                fecha: d["fecha"].as_str().unwrap_or_default().to_owned(),
                sueno_h: d["sueno_h"].as_f64(),
                pulso_reposo: d["pulso_reposo"].as_f64(),
                estres: d["estres"].as_f64(),
                pasos: d["pasos"].as_f64(),
                carga: d["carga"].as_f64().unwrap_or(0.0),
            })
            .collect(),
    }
}

pub fn rendimiento(v: &Value) -> RendimientoMision {
    let m = &v["metricas"];
    RendimientoMision {
        mision_id: v["mision_id"].as_str().unwrap_or_default().to_owned(),
        codigo: v["codigo"].as_str().unwrap_or_default().to_owned(),
        titulo: v["titulo"].as_str().map(str::to_owned),
        inicio: crate::archivo::segundos(&v["inicio"]),
        distancia_km: m["distancia_km"].as_f64().unwrap_or(0.0),
        duracion_min: m["duracion_min"].as_f64().unwrap_or(0.0),
        desnivel_pos_m: m["desnivel_pos_m"].as_f64().unwrap_or(0.0),
        fc_media: m["fc_media"].as_f64(),
        fc_max: m["fc_max"].as_f64(),
        zonas_min: m["zonas_min"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_f64)
            .collect(),
        trimp: m["trimp"].as_f64().unwrap_or(0.0),
        spo2_min: m["spo2_min"].as_f64(),
        preparacion: m["preparacion"]["puntuacion"].as_u64().map(|x| x as u8),
        esfuerzo: v["esfuerzo"].as_u64().map(|x| x as u8),
        sensacion: v["sensacion"].as_str().map(str::to_owned),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convierte_respuestas() {
        let e = estado(&json!({
            "preparacion": { "puntuacion": 37, "nivel": "baja", "resumen": "Atención", "linea_base": true,
                             "factores": [{ "clave": "sueno", "nombre": "Sueño", "texto": "Dormiste 4.6 h", "puntos": -22.4 }] },
            "pulsos": { "maximo": 186.0, "reposo": 58.0, "maximo_estimado": true, "zonas": [122, 135, 147, 160, 173] },
            "dias": [{ "fecha": "2026-11-02", "sueno_h": 4.6, "carga": 75.2 }]
        }));
        assert_eq!((e.puntuacion, e.fc_max, e.zonas.len()), (37, 186, 5));
        assert_eq!(e.factores[0].puntos, -22.4);
        assert_eq!(e.dias[0].sueno_h, Some(4.6));
        let r = rendimiento(
            &json!({ "mision_id": "m", "codigo": "MISION-1", "inicio": "2026-11-02T22:41:00Z", "esfuerzo": 7,
            "metricas": { "distancia_km": 5.9, "zonas_min": [23.0, 10.0, 11.0, 11.0, 5.0, 0.0], "trimp": 75.2,
                          "preparacion": { "puntuacion": 37 } } }),
        );
        assert_eq!(
            (r.esfuerzo, r.preparacion, r.zonas_min.len()),
            (Some(7), Some(37), 6)
        );
        assert!(r.inicio > 0);
        let c = cuerpo_fisico(&PerfilFisicoMovil {
            edad: Some(32),
            fc_max: Some(400),
            sexo: Some("x".into()),
            ..Default::default()
        });
        assert_eq!(c["fisico"]["edad"], 32);
        assert!(c["fisico"]["fc_max"].is_null() && c["fisico"]["sexo"].is_null());
    }
}
