//! Cortex: chat en streaming con la IA local, reporte de novedades y Deep-Dive
//! de la bitácora. El Markdown se simplifica a títulos, viñetas y párrafos.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::{DateTime, Local, Utc};
use serde_json::{Value, json};
use slint::{ComponentHandle, Model, ModelRc, VecModel};

use crate::panel::Contexto;
use crate::{ChatFila, Estado, LineaMd, MensajeChat};

/// Cada cuánto se repinta el texto que va llegando.
const REPINTAR: Duration = Duration::from_millis(60);

#[derive(Default)]
pub struct Memoria {
    chat: Option<String>,
    /// (rol, texto) de la conversación abierta.
    mensajes: Vec<(String, String)>,
}

pub type Compartida = Mutex<Memoria>;

pub fn preparar(e: &Estado<'_>) {
    e.set_cortex_mensajes(ModelRc::new(VecModel::<MensajeChat>::default()));
}

pub fn olvidar(c: &Contexto, e: &Estado<'_>) {
    *c.cortex.lock().expect("cortex") = Memoria::default();
    e.set_cortex_chats(ModelRc::default());
    e.set_cortex_chat("".into());
    e.set_cortex_estado("".into());
    e.set_cortex_error("".into());
    e.set_ia_abierta(false);
    pintar_todo(e, &[]);
}

/// Al abrir la pestaña: la lista de conversaciones.
pub fn entrar(c: &Arc<Contexto>) {
    let c2 = c.clone();
    c.rt.spawn(async move { cargar_lista(&c2).await });
}

async fn cargar_lista(c: &Arc<Contexto>) {
    let Ok(lista) = c.cliente.get::<Vec<Value>>("/v1/ia/chats").await else {
        return;
    };
    let filas: Vec<(String, String, String)> = lista
        .iter()
        .map(|ch| {
            (
                texto(ch, "id"),
                ch["titulo"]
                    .as_str()
                    .filter(|t| !t.is_empty())
                    .unwrap_or("Conversación")
                    .to_owned(),
                fecha(ch["actualizado_en"].as_str()),
            )
        })
        .collect();
    c.ui.upgrade_in_event_loop(move |ui| {
        let filas: Vec<ChatFila> = filas
            .into_iter()
            .map(|(id, titulo, fecha)| ChatFila {
                id: id.into(),
                titulo: titulo.into(),
                fecha: fecha.into(),
            })
            .collect();
        ui.global::<Estado>()
            .set_cortex_chats(ModelRc::new(VecModel::from(filas)));
    })
    .ok();
}

pub fn nuevo(c: &Contexto) {
    *c.cortex.lock().expect("cortex") = Memoria::default();
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_cortex_chat("".into());
        e.set_cortex_error("".into());
        pintar_todo(&e, &[]);
    }
}

pub fn abrir(c: &Arc<Contexto>, id: String) {
    let c2 = c.clone();
    c.rt.spawn(async move {
        let Ok(chat) = c2.cliente.get::<Value>(&format!("/v1/ia/chats/{id}")).await else {
            return;
        };
        let mensajes: Vec<(String, String)> = chat["mensajes"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|m| (texto(m, "rol"), texto(m, "contenido")))
            .collect();
        {
            let mut m = c2.cortex.lock().expect("cortex");
            m.chat = Some(id.clone());
            m.mensajes = mensajes.clone();
        }
        c2.ui
            .upgrade_in_event_loop(move |ui| {
                let e = ui.global::<Estado>();
                e.set_cortex_chat(id.into());
                e.set_cortex_error("".into());
                pintar_todo(&e, &mensajes);
            })
            .ok();
    });
}

pub fn borrar(c: &Arc<Contexto>, id: String) {
    let c2 = c.clone();
    c.rt.spawn(async move {
        if c2
            .cliente
            .borrar(&format!("/v1/ia/chats/{id}"))
            .await
            .is_ok()
        {
            let abierta = c2.cortex.lock().expect("cortex").chat.as_deref() == Some(id.as_str());
            if abierta {
                let c3 = c2.clone();
                c2.ui.upgrade_in_event_loop(move |_| nuevo(&c3)).ok();
            }
            cargar_lista(&c2).await;
        }
    });
}

/// Envía un mensaje y pinta la respuesta según llega.
pub fn enviar(c: &Arc<Contexto>, texto_usuario: String) {
    let texto_usuario = texto_usuario.trim().to_owned();
    if texto_usuario.is_empty() {
        return;
    }
    let chat_id = {
        let mut m = c.cortex.lock().expect("cortex");
        m.mensajes.push(("user".into(), texto_usuario.clone()));
        m.mensajes.push(("assistant".into(), String::new()));
        m.chat.clone()
    };
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_cortex_escribiendo(true);
        e.set_cortex_error("".into());
        let modelo = e.get_cortex_mensajes();
        if let Some(v) = modelo.as_any().downcast_ref::<VecModel<MensajeChat>>() {
            v.push(mensaje("user", &texto_usuario));
            v.push(mensaje("assistant", ""));
        }
    }
    let c2 = c.clone();
    c.rt.spawn(async move {
        let (lat, lng) = c2.ubicacion_aproximada().await.unzip();
        let cuerpo =
            json!({ "chat_id": chat_id, "mensaje": texto_usuario, "lat": lat, "lng": lng });
        let mut respuesta = String::new();
        let mut ultimo_pintado = Instant::now();
        let mut fin: Option<Value> = None;
        let r = c2
            .cliente
            .post_ndjson("/v1/ia/chat", &cuerpo, |ev| match ev["tipo"].as_str() {
                Some("token") => {
                    respuesta.push_str(ev["texto"].as_str().unwrap_or_default());
                    if ultimo_pintado.elapsed() > REPINTAR {
                        ultimo_pintado = Instant::now();
                        pintar_respuesta(&c2, &respuesta, "");
                    }
                }
                Some("reiniciar") => respuesta.clear(),
                Some("estado") => {
                    pintar_respuesta(&c2, &respuesta, ev["texto"].as_str().unwrap_or_default())
                }
                Some("error") => {
                    let error = ev["texto"].as_str().unwrap_or("error de la IA").to_owned();
                    c2.ui
                        .upgrade_in_event_loop(move |ui| {
                            ui.global::<Estado>().set_cortex_error(error.into())
                        })
                        .ok();
                }
                Some("fin") => fin = Some(ev),
                _ => {}
            })
            .await;
        if let Err(e) = r {
            let error = e.to_string();
            c2.ui
                .upgrade_in_event_loop(move |ui| {
                    ui.global::<Estado>().set_cortex_error(error.into())
                })
                .ok();
        }
        {
            let mut m = c2.cortex.lock().expect("cortex");
            if let Some(ultimo) = m.mensajes.last_mut() {
                ultimo.1 = respuesta.clone();
            }
            if let Some(id) = fin.as_ref().and_then(|f| f["chat_id"].as_str()) {
                m.chat = Some(id.to_owned());
            }
        }
        pintar_respuesta(&c2, &respuesta, "");
        let id = fin
            .as_ref()
            .and_then(|f| f["chat_id"].as_str())
            .map(str::to_owned);
        let pie = fin
            .as_ref()
            .map(|f| {
                format!(
                    "Respondido en {:.1} s",
                    f["segundos"].as_f64().unwrap_or(0.0)
                )
            })
            .unwrap_or_default();
        c2.ui
            .upgrade_in_event_loop(move |ui| {
                let e = ui.global::<Estado>();
                e.set_cortex_escribiendo(false);
                e.set_cortex_estado(pie.into());
                if let Some(id) = id {
                    e.set_cortex_chat(id.into());
                }
            })
            .ok();
        cargar_lista(&c2).await;
    });
}

/// Repinta el último mensaje (el de Cortex) y la línea de estado.
fn pintar_respuesta(c: &Contexto, texto: &str, estado: &str) {
    let lineas = markdown(texto);
    let estado = estado.to_owned();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_cortex_estado(estado.into());
        let modelo = e.get_cortex_mensajes();
        let n = modelo.row_count();
        if n > 0 {
            modelo.set_row_data(
                n - 1,
                MensajeChat {
                    rol: "assistant".into(),
                    lineas: modelo_lineas(lineas),
                },
            );
        }
    })
    .ok();
}

fn pintar_todo(e: &Estado<'_>, mensajes: &[(String, String)]) {
    let filas: Vec<MensajeChat> = mensajes.iter().map(|(r, t)| mensaje(r, t)).collect();
    let modelo = e.get_cortex_mensajes();
    if let Some(v) = modelo.as_any().downcast_ref::<VecModel<MensajeChat>>() {
        v.set_vec(filas);
    }
}

fn mensaje(rol: &str, texto: &str) -> MensajeChat {
    let lineas = if rol == "user" {
        vec![(texto.to_owned(), 0)]
    } else if texto.is_empty() {
        vec![("…".to_owned(), 0)]
    } else {
        markdown(texto)
    };
    MensajeChat {
        rol: rol.into(),
        lineas: modelo_lineas(lineas),
    }
}

fn modelo_lineas(lineas: Vec<(String, i32)>) -> ModelRc<LineaMd> {
    ModelRc::new(VecModel::from(
        lineas
            .into_iter()
            .map(|(texto, tipo)| LineaMd {
                texto: texto.into(),
                tipo,
            })
            .collect::<Vec<_>>(),
    ))
}

// --- Reporte y Deep-Dive --------------------------------------------------------

pub fn reporte(c: &Arc<Contexto>, forzar: bool) {
    abrir_ventana(c, "Novedades de Cortex", true);
    let c2 = c.clone();
    c.rt.spawn(async move {
        let (lat, lng) = c2.ubicacion_aproximada().await.unzip();
        let mut ruta = format!("/v1/ia/reporte?forzar={forzar}");
        if let (Some(lat), Some(lng)) = (lat, lng) {
            ruta.push_str(&format!("&lat={lat}&lng={lng}"));
        }
        let r = c2.cliente.get::<Value>(&ruta).await;
        let (lineas, estado) = match r {
            Ok(v) => (
                markdown(v["reporte"].as_str().unwrap_or_default()),
                format!("Generado {}", fecha(v["generado_en"].as_str())),
            ),
            Err(e) => (Vec::new(), format!("⚠ {e}")),
        };
        c2.ui
            .upgrade_in_event_loop(move |ui| {
                let e = ui.global::<Estado>();
                e.set_ia_lineas(modelo_lineas(lineas));
                e.set_ia_estado(estado.into());
                e.set_ia_cargando(false);
            })
            .ok();
    });
}

pub fn analizar(c: &Arc<Contexto>, notificacion: String) {
    abrir_ventana(c, "Deep-Dive · análisis de Cortex", false);
    let c2 = c.clone();
    c.rt.spawn(async move {
        let (lat, lng) = c2.ubicacion_aproximada().await.unzip();
        let cuerpo = json!({ "notificacion_id": notificacion, "lat": lat, "lng": lng });
        let mut texto_ia = String::new();
        let mut ultimo = Instant::now();
        let mut estado = String::new();
        let r = c2
            .cliente
            .post_ndjson("/v1/ia/analizar", &cuerpo, |ev| {
                match ev["tipo"].as_str() {
                    Some("token") => texto_ia.push_str(ev["texto"].as_str().unwrap_or_default()),
                    Some("reiniciar") => texto_ia.clear(),
                    Some("estado") => estado = ev["texto"].as_str().unwrap_or_default().to_owned(),
                    Some("error") => {
                        estado = format!("⚠ {}", ev["texto"].as_str().unwrap_or_default())
                    }
                    Some("fin") => {
                        estado = format!(
                            "Analizado en {:.1} s",
                            ev["segundos"].as_f64().unwrap_or(0.0)
                        );
                    }
                    _ => {}
                }
                if ultimo.elapsed() > REPINTAR || ev["tipo"] != "token" {
                    ultimo = Instant::now();
                    pintar_ventana(&c2, &texto_ia, &estado, true);
                }
            })
            .await;
        if let Err(e) = r {
            estado = format!("⚠ {e}");
        }
        pintar_ventana(&c2, &texto_ia, &estado, false);
    });
}

fn abrir_ventana(c: &Contexto, titulo: &str, regenerable: bool) {
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_ia_titulo(titulo.into());
        e.set_ia_lineas(ModelRc::default());
        e.set_ia_estado("Cortex está pensando…".into());
        e.set_ia_cargando(true);
        e.set_ia_regenerable(regenerable);
        e.set_ia_abierta(true);
    }
}

fn pintar_ventana(c: &Contexto, texto: &str, estado: &str, cargando: bool) {
    let lineas = markdown(texto);
    let estado = estado.to_owned();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_ia_lineas(modelo_lineas(lineas));
        e.set_ia_estado(estado.into());
        e.set_ia_cargando(cargando);
    })
    .ok();
}

// --- Markdown -----------------------------------------------------------------

/// Markdown → líneas: `(texto, 0 párrafo | 1 título | 2 viñeta)`. Quita el
/// énfasis (`**`, `__`, `` ` ``) porque Slint no mezcla estilos en un texto.
pub fn markdown(texto: &str) -> Vec<(String, i32)> {
    let mut lineas = Vec::new();
    for crudo in texto.lines() {
        let l = crudo.trim();
        if l.is_empty() || l.chars().all(|c| c == '-' || c == '*' || c == '_') {
            continue;
        }
        let (tipo, cuerpo) = if let Some(t) = l.strip_prefix('#') {
            (1, t.trim_start_matches('#').trim())
        } else if let Some(t) = ["- ", "* ", "• ", "+ "]
            .iter()
            .find_map(|p| l.strip_prefix(p))
        {
            (2, t.trim())
        } else {
            (0, l)
        };
        let limpio = cuerpo.replace(['*', '`'], "").replace("__", "");
        if !limpio.is_empty() {
            lineas.push((limpio, tipo));
        }
    }
    lineas
}

fn texto(v: &Value, campo: &str) -> String {
    v[campo].as_str().unwrap_or_default().to_owned()
}

fn fecha(s: Option<&str>) -> String {
    s.and_then(|s| s.parse::<DateTime<Utc>>().ok())
        .map(|d| d.with_timezone(&Local).format("%d/%m · %H:%M").to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_simplificado() {
        let md = "### 🌤️ Tiempo\n*   **Caracas**: 24°C\n- Viento `9 km/h` *suave*\n\nTexto normal\n---\n1. Paso uno";
        assert_eq!(
            markdown(md),
            vec![
                ("🌤️ Tiempo".to_owned(), 1),
                ("Caracas: 24°C".to_owned(), 2),
                ("Viento 9 km/h suave".to_owned(), 2),
                ("Texto normal".to_owned(), 0),
                ("1. Paso uno".to_owned(), 0),
            ]
        );
    }
}
