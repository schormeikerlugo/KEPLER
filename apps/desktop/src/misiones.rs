//! Misiones desde el Centro de Control: detalle, ciclo de vida (iniciar,
//! completar, abortar), rastro en el mapa, hallazgos, reporte de Cortex y alta
//! de misiones planificadas.

use std::sync::Arc;

use chrono::{DateTime, Local, Utc};
use serde_json::{Value, json};
use slint::{ComponentHandle, ModelRc, VecModel};

use crate::panel::Contexto;
use crate::{Estado, LineaMd, cortex, vista_mapa};

pub fn abrir(c: &Arc<Contexto>, id: String) {
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_mision_id(id.as_str().into());
        e.set_mision_titulo("Cargando…".into());
        e.set_mision_codigo("".into());
        e.set_mision_estado("".into());
        e.set_mision_datos("".into());
        e.set_mision_hallazgos("".into());
        e.set_mision_reporte(ModelRc::default());
        e.set_mision_mensaje("".into());
        e.set_mision_ocupada(false);
        e.set_mision_abierta(true);
    }
    let c2 = c.clone();
    c.rt.spawn(async move { cargar(&c2, &id).await });
}

async fn cargar(c: &Arc<Contexto>, id: &str) {
    let ruta = |tipo: &str| format!("/v1/archivos?tipo={tipo}&mision={id}&limite=200");
    let (rm, ro, rp, ri) = (
        format!("/v1/misiones/{id}"),
        ruta("objetos"),
        ruta("personas"),
        ruta("puntos_interes"),
    );
    let (m, objetos, personas, pois) = tokio::join!(
        c.cliente.get::<Value>(&rm),
        c.cliente.get::<Value>(&ro),
        c.cliente.get::<Value>(&rp),
        c.cliente.get::<Value>(&ri),
    );
    let Ok(m) = m else {
        mensaje(c, "⚠ No se pudo cargar la misión");
        return;
    };
    let cuenta = |r: &Result<Value, _>| {
        r.as_ref()
            .ok()
            .and_then(|v| v["items"].as_array().map(Vec::len))
            .unwrap_or(0)
    };
    let hallazgos = format!(
        "{} objetos · {} personas · {} puntos de interés",
        cuenta(&objetos),
        cuenta(&personas),
        cuenta(&pois)
    );
    let titulo = m["titulo"]
        .as_str()
        .filter(|t| !t.is_empty())
        .or(m["codigo"].as_str())
        .unwrap_or("Misión")
        .to_owned();
    let codigo = m["codigo"].as_str().unwrap_or_default().to_owned();
    let estado = m["estado"].as_str().unwrap_or_default().to_owned();
    let datos = datos(&m);
    let reporte = m["descripcion_ia"]
        .as_str()
        .map(cortex::markdown)
        .unwrap_or_default();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_mision_titulo(titulo.into());
        e.set_mision_codigo(codigo.into());
        e.set_mision_estado(estado.into());
        e.set_mision_datos(datos.into());
        e.set_mision_hallazgos(hallazgos.into());
        e.set_mision_reporte(lineas(reporte));
    })
    .ok();
}

/// Ficha en texto: zona, terreno, fechas, distancia, duración, clima al despegar.
fn datos(m: &Value) -> String {
    let mut partes = Vec::new();
    if let Some(o) = m["objetivo"].as_str().filter(|s| !s.is_empty()) {
        partes.push(format!("Objetivo: {o}"));
    }
    let mut linea = Vec::new();
    if let Some(z) = m["zona"].as_str() {
        linea.push(format!("Zona: {z}"));
    }
    if let Some(t) = m["tipo_terreno"].as_str() {
        linea.push(format!(
            "terreno {}",
            if t == "montana" { "montaña" } else { t }
        ));
    }
    if let Some(d) = m["dificultad"].as_str() {
        linea.push(format!("dificultad {d}"));
    }
    if !linea.is_empty() {
        partes.push(linea.join(" · "));
    }
    let fecha = |k: &str| {
        m[k].as_str()
            .and_then(|s| s.parse::<DateTime<Utc>>().ok())
            .map(|d| d.with_timezone(&Local).format("%d/%m/%Y %H:%M").to_string())
    };
    match (fecha("inicio_en"), fecha("fin_en")) {
        (Some(i), Some(f)) => partes.push(format!("Del {i} al {f}")),
        (Some(i), None) => partes.push(format!("En curso desde el {i}")),
        _ => partes.push(format!(
            "Creada el {}",
            fecha("creado_en").unwrap_or_default()
        )),
    }
    let km = m["distancia_m"].as_f64().unwrap_or(0.0) / 1000.0;
    let min = m["duracion_s"].as_f64().unwrap_or(0.0) / 60.0;
    if km > 0.0 || min > 0.0 {
        let vmax = m["vel_max_mps"].as_f64().unwrap_or(0.0) * 3.6;
        partes.push(format!(
            "{km:.2} km en {min:.0} min · velocidad máxima {vmax:.1} km/h"
        ));
    }
    let clima = &m["clima"];
    if let Some(t) = clima["temperatura_c"].as_f64() {
        partes.push(format!(
            "Clima al despegar: {t:.0} °C, {}",
            clima["categoria"].as_str().unwrap_or("—").replace('_', " ")
        ));
    }
    partes.join("\n")
}

/// Botones del detalle.
pub fn accion(c: &Arc<Contexto>, accion: &str, ir: impl Fn(crate::Pantalla)) {
    let Some(ui) = c.ui.upgrade() else { return };
    let e = ui.global::<Estado>();
    let id = e.get_mision_id().to_string();
    match accion {
        "mapa" => {
            e.set_mision_abierta(false);
            vista_mapa::ver_mision(c, id);
            ir(crate::Pantalla::Mapa);
        }
        "hallazgos" => {
            e.set_mision_abierta(false);
            e.set_archivos_mision(id.into());
            e.set_archivos_busqueda("".into());
            ir(crate::Pantalla::Archivos);
        }
        "iniciar" | "completar" | "abortar" => {
            e.set_mision_ocupada(true);
            let c2 = c.clone();
            let accion = accion.to_owned();
            c.rt.spawn(async move {
                let r = c2
                    .cliente
                    .post::<Value>(&format!("/v1/misiones/{id}/{accion}"), &json!({}))
                    .await;
                if let Err(err) = r {
                    mensaje(&c2, &format!("⚠ {err}"));
                }
                cargar(&c2, &id).await;
                ocupada(&c2, false);
            });
        }
        "documentar" => {
            e.set_mision_ocupada(true);
            e.set_mision_mensaje(
                "Cortex está redactando el reporte con los datos de la misión…".into(),
            );
            let c2 = c.clone();
            c.rt.spawn(async move {
                match c2
                    .cliente
                    .post::<Value>(&format!("/v1/ia/documentar/{id}"), &json!({}))
                    .await
                {
                    Ok(_) => {
                        mensaje(&c2, "");
                        cargar(&c2, &id).await;
                    }
                    Err(err) => mensaje(&c2, &format!("⚠ {err}")),
                }
                ocupada(&c2, false);
            });
        }
        _ => {}
    }
}

pub fn crear(
    c: &Arc<Contexto>,
    titulo: String,
    objetivo: String,
    zona: String,
    terreno: String,
    dificultad: String,
) {
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_mision_ocupada(true);
        e.set_mision_mensaje("".into());
    }
    let c2 = c.clone();
    c.rt.spawn(async move {
        let texto = |s: &str| {
            let t = s.trim();
            if t.is_empty() { Value::Null } else { json!(t) }
        };
        let cuerpo = json!({
            "titulo": titulo.trim(), "objetivo": texto(&objetivo), "zona": texto(&zona),
            "tipo_terreno": terreno, "dificultad": dificultad,
        });
        match c2.cliente.post::<Value>("/v1/misiones", &cuerpo).await {
            Ok(m) => {
                let id = m["id"].as_str().unwrap_or_default().to_owned();
                let c3 = c2.clone();
                c2.ui
                    .upgrade_in_event_loop(move |ui| {
                        ui.global::<Estado>().set_nueva_mision_abierta(false);
                        abrir(&c3, id);
                    })
                    .ok();
            }
            Err(err) => mensaje(&c2, &format!("⚠ {err}")),
        }
        ocupada(&c2, false);
    });
}

fn lineas(l: Vec<(String, i32)>) -> ModelRc<LineaMd> {
    ModelRc::new(VecModel::from(
        l.into_iter()
            .map(|(texto, tipo)| LineaMd {
                texto: texto.into(),
                tipo,
            })
            .collect::<Vec<_>>(),
    ))
}

fn mensaje(c: &Contexto, texto: &str) {
    let texto = texto.to_owned();
    c.ui.upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_mision_mensaje(texto.into()))
        .ok();
}

fn ocupada(c: &Contexto, si: bool) {
    c.ui.upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_mision_ocupada(si))
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ficha_de_mision() {
        let m = json!({
            "zona": "El Ávila", "tipo_terreno": "montana", "dificultad": "alta",
            "inicio_en": "2026-11-01T12:00:00Z", "fin_en": "2026-11-01T12:40:00Z",
            "distancia_m": 5890.0, "duracion_s": 2400, "vel_max_mps": 1.5,
            "clima": { "temperatura_c": 24.6, "categoria": "viento_fuerte" }
        });
        let d = datos(&m);
        assert!(
            d.contains("Zona: El Ávila · terreno montaña · dificultad alta"),
            "{d}"
        );
        assert!(
            d.contains("5.89 km en 40 min · velocidad máxima 5.4 km/h"),
            "{d}"
        );
        assert!(d.contains("25 °C, viento fuerte"), "{d}");
    }
}
