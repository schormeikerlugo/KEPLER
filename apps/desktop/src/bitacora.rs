//! Notificaciones: campana (las 20 últimas), toasts de lo nuevo y bitácora paginada.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Local, Utc};
use kepler_core::TipoNotificacion;
use serde::Deserialize;
use serde_json::json;
use slint::{ComponentHandle, Model, ModelRc, VecModel};

use crate::panel::Contexto;
use crate::{Estado, Notificacion};

const EN_PANEL: usize = 20;
const POR_PAGINA: usize = 50;
const TOASTS_MAX: usize = 4;

#[derive(Debug, Clone, Deserialize)]
struct Entrada {
    id: String,
    tipo: TipoNotificacion,
    mensaje: String,
    leida: bool,
    creado_en: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct Lista {
    items: Vec<Entrada>,
    no_leidas: i64,
}

#[derive(Debug, Deserialize)]
struct Leidas {
    no_leidas: i64,
}

/// Lo que la bitácora recuerda entre cargas.
#[derive(Default)]
pub struct Memoria {
    /// Ids ya mostrados: solo lo nuevo sale como toast.
    vistos: HashSet<String>,
    primera_carga_hecha: bool,
    /// Fecha de la última entrada cargada en la bitácora (paginación).
    cursor: Option<DateTime<Utc>>,
}

/// Modelos que viven en el hilo de la UI: se crean una vez y se modifican en sitio.
pub fn preparar(e: &Estado<'_>) {
    e.set_toasts(ModelRc::new(VecModel::<Notificacion>::default()));
    e.set_bitacora(ModelRc::new(VecModel::<Notificacion>::default()));
}

pub fn olvidar(e: &Estado<'_>) {
    e.set_notificaciones(ModelRc::default());
    e.set_no_leidas(0);
    vaciar(&e.get_toasts());
    vaciar(&e.get_bitacora());
}

/// Últimas notificaciones para la campana; las nuevas salen como toast
/// (salvo en la primera carga tras entrar).
pub async fn cargar(c: &Arc<Contexto>) {
    let Ok(lista) = c
        .cliente
        .get::<Lista>(&format!("/v1/notificaciones?limite={EN_PANEL}"))
        .await
    else {
        return;
    };
    let nuevas: Vec<Entrada> = {
        let mut m = c.bitacora.lock().await;
        let primera = !m.primera_carga_hecha;
        m.primera_carga_hecha = true;
        lista
            .items
            .iter()
            .filter(|n| m.vistos.insert(n.id.clone()) && !primera && !n.leida)
            .cloned()
            .collect()
    };
    let panel: Vec<Notificacion> = lista.items.iter().map(a_fila).collect();
    let no_leidas = lista.no_leidas as i32;
    let toasts: Vec<(Notificacion, Option<u32>)> = nuevas
        .iter()
        .rev()
        .map(|n| (a_fila(n), n.tipo.duracion_toast_s()))
        .collect();

    let c2 = c.clone();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_notificaciones(ModelRc::new(VecModel::from(panel)));
        e.set_no_leidas(no_leidas);
        let modelo = e.get_toasts();
        let Some(t) = vec_model(&modelo) else { return };
        for (fila, segundos) in toasts {
            if t.row_count() >= TOASTS_MAX {
                t.remove(0);
            }
            let id = fila.id.to_string();
            t.push(fila);
            if let Some(s) = segundos {
                let c3 = c2.clone();
                c2.rt.spawn(async move {
                    tokio::time::sleep(Duration::from_secs(s.into())).await;
                    c3.ui
                        .upgrade_in_event_loop(move |ui| cerrar_toast(&ui.global::<Estado>(), &id))
                        .ok();
                });
            }
        }
    })
    .ok();
}

pub fn cerrar_toast(e: &Estado<'_>, id: &str) {
    let modelo = e.get_toasts();
    if let Some(t) = vec_model(&modelo)
        && let Some(i) = t.iter().position(|n| n.id == id)
    {
        t.remove(i);
    }
}

/// Bitácora con los filtros actuales; `seguir` añade la página siguiente.
pub async fn cargar_bitacora(c: &Arc<Contexto>, tipo: String, solo_no_leidas: bool, seguir: bool) {
    c.ui.upgrade_in_event_loop(|ui| ui.global::<Estado>().set_bitacora_cargando(true))
        .ok();
    let cursor = if seguir {
        c.bitacora.lock().await.cursor
    } else {
        None
    };
    let mut ruta =
        format!("/v1/notificaciones?limite={POR_PAGINA}&solo_no_leidas={solo_no_leidas}");
    if !tipo.is_empty() {
        ruta.push_str(&format!("&tipo={tipo}"));
    }
    if let Some(antes) = cursor {
        ruta.push_str(&format!(
            "&antes={}",
            antes
                .to_rfc3339_opts(chrono::SecondsFormat::Micros, true)
                .replace('+', "%2B")
        ));
    }
    let r = c.cliente.get::<Lista>(&ruta).await;
    let lista = match r {
        Ok(l) => l,
        Err(_) => {
            c.ui.upgrade_in_event_loop(|ui| ui.global::<Estado>().set_bitacora_cargando(false))
                .ok();
            return;
        }
    };
    c.bitacora.lock().await.cursor = lista.items.last().map(|n| n.creado_en);
    let hay_mas = lista.items.len() == POR_PAGINA;
    let filas: Vec<Notificacion> = lista.items.iter().map(a_fila).collect();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        let modelo = e.get_bitacora();
        if let Some(b) = vec_model(&modelo) {
            if !seguir {
                b.clear();
            }
            b.extend(filas);
        }
        e.set_bitacora_hay_mas(hay_mas);
        e.set_bitacora_cargando(false);
    })
    .ok();
}

/// Marca leídas (`None` = todas) y refleja el cambio sin recargar la bitácora.
pub async fn marcar(c: &Arc<Contexto>, id: Option<String>) {
    let cuerpo = match &id {
        Some(id) => json!({ "ids": [id] }),
        None => json!({ "todas": true }),
    };
    let Ok(r) = c
        .cliente
        .post::<Leidas>("/v1/notificaciones/leer", &cuerpo)
        .await
    else {
        return;
    };
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_no_leidas(r.no_leidas as i32);
        for modelo in [e.get_bitacora(), e.get_notificaciones()] {
            for i in 0..modelo.row_count() {
                if let Some(mut fila) = modelo.row_data(i)
                    && !fila.leida
                    && id.as_deref().is_none_or(|id| fila.id == id)
                {
                    fila.leida = true;
                    modelo.set_row_data(i, fila);
                }
            }
        }
    })
    .ok();
}

fn a_fila(n: &Entrada) -> Notificacion {
    Notificacion {
        id: n.id.as_str().into(),
        tipo: n.tipo.como_str().into(),
        mensaje: n.mensaje.as_str().into(),
        fecha: fecha_legible(n.creado_en, Utc::now()).into(),
        leida: n.leida,
    }
}

/// «hace 5 min», «hoy 14:32», «ayer 09:10» o «31/10/2026 14:32».
fn fecha_legible(fecha: DateTime<Utc>, ahora: DateTime<Utc>) -> String {
    let minutos = (ahora - fecha).num_minutes();
    if minutos < 1 {
        return "ahora".into();
    }
    if minutos < 60 {
        return format!("hace {minutos} min");
    }
    let (local, hoy) = (
        fecha.with_timezone(&Local),
        ahora.with_timezone(&Local).date_naive(),
    );
    let hora = local.format("%H:%M");
    match (hoy - local.date_naive()).num_days() {
        0 => format!("hoy {hora}"),
        1 => format!("ayer {hora}"),
        _ => local.format("%d/%m/%Y %H:%M").to_string(),
    }
}

fn vec_model(m: &ModelRc<Notificacion>) -> Option<&VecModel<Notificacion>> {
    m.as_any().downcast_ref::<VecModel<Notificacion>>()
}

fn vaciar(m: &ModelRc<Notificacion>) {
    if let Some(v) = vec_model(m) {
        v.clear();
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    #[test]
    fn fechas_relativas() {
        let ahora = Utc.with_ymd_and_hms(2026, 11, 1, 18, 0, 0).unwrap();
        assert_eq!(fecha_legible(ahora, ahora), "ahora");
        assert_eq!(
            fecha_legible(ahora - chrono::Duration::minutes(5), ahora),
            "hace 5 min"
        );
        let vieja = fecha_legible(ahora - chrono::Duration::days(10), ahora);
        assert!(vieja.contains("/10/2026"), "{vieja}");
    }
}
