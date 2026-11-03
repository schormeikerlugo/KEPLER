//! Preparación del explorador en el dashboard (F8): puntuación, factores,
//! datos de hoy y la última misión con rendimiento.

use std::sync::Arc;

use chrono::Local;
use serde_json::Value;
use slint::{ComponentHandle, ModelRc, VecModel};

use crate::panel::Contexto;
use crate::{Estado, FactorPrep};

/// Lo que se pinta, ya formateado (`Send`: se arma fuera del hilo de Slint).
struct Vista {
    puntuacion: i32,
    nivel: String,
    resumen: String,
    factores: Vec<(String, String, bool)>,
    sueno: String,
    reposo: String,
    estres: String,
    pasos: String,
    base: String,
    ultima: String,
}

fn dato(v: &Value, formato: impl Fn(f64) -> String) -> String {
    v.as_f64().map_or_else(|| "—".into(), formato)
}

fn vista(p: &Value, rendimiento: Option<&Value>) -> Vista {
    let prep = &p["preparacion"];
    let hoy = p["dias"]
        .as_array()
        .and_then(|d| d.last())
        .filter(|d| d["fecha"] == p["fecha"]);
    let campo = |k: &str| hoy.map(|d| d[k].clone()).unwrap_or(Value::Null);
    let factores = prep["factores"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|f| {
            let puntos = f["puntos"].as_f64()?;
            (puntos != 0.0).then(|| {
                (
                    f["texto"].as_str().unwrap_or_default().to_owned(),
                    format!("{puntos:+.0}"),
                    puntos < 0.0,
                )
            })
        })
        .collect();
    let ultima = rendimiento
        .map(|r| {
            let m = &r["metricas"];
            let mut s = format!(
                "Última misión: {} · {:.1} km · +{:.0} m · carga {:.0}",
                r["titulo"].as_str().or(r["codigo"].as_str()).unwrap_or("?"),
                m["distancia_km"].as_f64().unwrap_or(0.0),
                m["desnivel_pos_m"].as_f64().unwrap_or(0.0),
                m["trimp"].as_f64().unwrap_or(0.0)
            );
            if let Some(e) = r["esfuerzo"].as_u64() {
                s.push_str(&format!(" · esfuerzo {e}/10"));
            }
            s
        })
        .unwrap_or_default();
    Vista {
        puntuacion: prep["puntuacion"].as_i64().unwrap_or(0) as i32,
        nivel: prep["nivel"].as_str().unwrap_or("media").to_owned(),
        resumen: prep["resumen"].as_str().unwrap_or_default().to_owned(),
        factores,
        sueno: dato(&campo("sueno_h"), |h| format!("{h:.1} h")),
        reposo: dato(&campo("pulso_reposo"), |x| format!("{x:.0}")),
        estres: dato(&campo("estres"), |x| format!("{x:.0}")),
        pasos: dato(&campo("pasos"), |x| format!("{x:.0}")),
        base: if prep["linea_base"].as_bool() == Some(true) {
            String::new()
        } else {
            "Aún aprendiendo tu normalidad: hacen falta unos días de sueño y pulso del reloj."
                .into()
        },
        ultima,
    }
}

pub async fn cargar(c: &Arc<Contexto>) {
    let desfase = Local::now().offset().local_minus_utc() / 60;
    let ruta = format!("/v1/biometria/preparacion?desfase_min={desfase}");
    let (p, r) = tokio::join!(
        c.cliente.get::<Value>(&ruta),
        c.cliente.get::<Value>("/v1/rendimiento?limite=1"),
    );
    let Ok(p) = p else { return };
    let r = r.ok();
    let v = vista(&p, r.as_ref().and_then(|r| r["items"].get(0)));
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_prep_hay(true);
        e.set_prep_puntuacion(v.puntuacion);
        e.set_prep_nivel(v.nivel.into());
        e.set_prep_resumen(v.resumen.into());
        e.set_prep_factores(ModelRc::new(VecModel::from(
            v.factores
                .into_iter()
                .map(|(texto, puntos, negativo)| FactorPrep {
                    texto: texto.into(),
                    puntos: puntos.into(),
                    negativo,
                })
                .collect::<Vec<_>>(),
        )));
        e.set_prep_sueno(v.sueno.into());
        e.set_prep_reposo(v.reposo.into());
        e.set_prep_estres(v.estres.into());
        e.set_prep_pasos(v.pasos.into());
        e.set_prep_base(v.base.into());
        e.set_prep_ultima(v.ultima.into());
    })
    .ok();
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn formatea_la_preparacion() {
        let p = json!({ "fecha": "2026-11-02",
            "preparacion": { "puntuacion": 37, "nivel": "baja", "resumen": "Atención", "linea_base": true,
                             "factores": [{ "texto": "Dormiste 4.6 h", "puntos": -22.4 }, { "texto": "Estrés", "puntos": 0.0 }] },
            "dias": [{ "fecha": "2026-11-02", "sueno_h": 4.6, "pulso_reposo": 66.0 }] });
        let r = json!({ "titulo": "Subida", "esfuerzo": 7, "metricas": { "distancia_km": 5.9, "desnivel_pos_m": 396.0, "trimp": 75.2 } });
        let v = vista(&p, Some(&r));
        assert_eq!((v.puntuacion, v.factores.len()), (37, 1));
        assert_eq!(v.factores[0].1, "-22");
        assert_eq!(
            (v.sueno.as_str(), v.reposo.as_str(), v.pasos.as_str()),
            ("4.6 h", "66", "—")
        );
        assert!(v.base.is_empty());
        assert!(v.ultima.contains("esfuerzo 7/10"), "{}", v.ultima);
    }
}
