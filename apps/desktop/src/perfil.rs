//! Perfil (datos, foto, avatar de Cortex, calzado, contraseña), taxonomía con
//! etiquetas personales y estado del sistema.

use std::sync::{Arc, Mutex};

use base64::Engine;
use serde_json::{Value, json};
use slint::{Color, ComponentHandle, ModelRc, VecModel};

use crate::imagenes::{self, GRANDE};
use crate::mapa;
use crate::modelos::{Explorador, Perfil};
use crate::panel::Contexto;
use crate::{CategoriaTax, Estado, EtiquetaSel, FilaSistema};

/// Lado mayor de la foto de perfil que se sube.
const LADO_FOTO: u32 = 640;

#[derive(Default)]
pub struct Memoria {
    perfil: Option<Perfil>,
    foto: Option<String>,
}

pub type Compartida = Mutex<Memoria>;

/// Tras cada carga del perfil: lo guarda y trae la foto si cambió.
pub fn recordar(c: &Arc<Contexto>, perfil: Perfil) {
    let ruta = perfil.avatar_path.clone();
    let cambio = {
        let mut m = c.perfil.lock().expect("perfil");
        m.perfil = Some(perfil);
        let cambio = m.foto != ruta;
        m.foto.clone_from(&ruta);
        cambio
    };
    if cambio && let Some(ruta) = ruta {
        let c2 = c.clone();
        c.rt.spawn(async move { mostrar_foto(&c2, &ruta).await });
    }
}

async fn mostrar_foto(c: &Arc<Contexto>, ruta: &str) {
    if let Some(px) = c.imagenes.obtener(&c.cliente, ruta, GRANDE / 2).await {
        c.ui.upgrade_in_event_loop(move |ui| {
            let e = ui.global::<Estado>();
            e.set_foto(imagenes::a_imagen(px));
            e.set_tiene_foto(true);
        })
        .ok();
    }
}

pub fn olvidar(c: &Contexto, e: &Estado<'_>) {
    *c.perfil.lock().expect("perfil") = Memoria::default();
    e.set_tiene_foto(false);
    e.set_perfil_abierto(false);
    e.set_tax_abierta(false);
    e.set_sis_abierto(false);
}

pub fn abrir(c: &Arc<Contexto>) {
    let p = c.perfil.lock().expect("perfil").perfil.clone();
    if let (Some(p), Some(ui)) = (p, c.ui.upgrade()) {
        let e = ui.global::<Estado>();
        e.set_perfil_nombre(p.nombre_visible.unwrap_or_default().into());
        e.set_perfil_bio(p.bio.unwrap_or_default().into());
        e.set_perfil_ubicacion(p.ubicacion.unwrap_or_default().into());
        let avatar = p
            .avatar_ia
            .as_deref()
            .and_then(|a| a.strip_prefix("emoji:"))
            .unwrap_or("🤖");
        e.set_perfil_avatar_ia(avatar.into());
        e.set_perfil_mensaje("".into());
        e.set_perfil_datos("".into());
        e.set_perfil_abierto(true);
    }
    let c2 = c.clone();
    c.rt.spawn(async move {
        let (explorador, dashboard) = tokio::join!(
            c2.cliente.get::<Explorador>("/v1/explorador"),
            c2.cliente.get::<Value>("/v1/dashboard"),
        );
        let mut partes = Vec::new();
        if let Ok(x) = explorador {
            partes.push(format!(
                "{} misiones completadas · {:.1} km",
                x.misiones_completadas, x.distancia_total_km
            ));
        }
        if let Ok(d) = dashboard {
            let k = &d["conteos"];
            partes.push(format!(
                "{} objetos · {} personas · {} POIs · {} rutas",
                k["objetos"], k["personas"], k["puntos_interes"], k["rutas"]
            ));
        }
        let datos = partes.join("\n");
        c2.ui
            .upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_perfil_datos(datos.into()))
            .ok();
    });
}

pub fn guardar(
    c: &Arc<Contexto>,
    nombre: String,
    bio: String,
    ubicacion: String,
    avatar_ia: String,
) {
    ocupado(c, true, "");
    let c2 = c.clone();
    c.rt.spawn(async move {
        let cuerpo = json!({
            "nombre_visible": nombre.trim(), "bio": bio.trim(), "ubicacion": ubicacion.trim(),
            "avatar_ia": format!("emoji:{avatar_ia}"),
        });
        match c2.cliente.patch::<Perfil>("/v1/yo", &cuerpo).await {
            Ok(p) => {
                let visible = p.nombre_visible.clone().unwrap_or_default();
                recordar(&c2, p);
                c2.ui
                    .upgrade_in_event_loop(move |ui| {
                        let e = ui.global::<Estado>();
                        e.set_iniciales(crate::panel::iniciales(&visible).into());
                        e.set_nombre_visible(visible.into());
                        e.set_cortex_avatar(avatar_ia.into());
                        e.set_perfil_abierto(false);
                    })
                    .ok();
                ocupado(&c2, false, "");
            }
            Err(e) => ocupado(&c2, false, &format!("⚠ {e}")),
        }
    });
}

/// Elige una imagen, la reduce a JPEG y la sube como foto de perfil.
pub fn foto(c: &Arc<Contexto>) {
    let c2 = c.clone();
    c.rt.spawn(async move {
        let Some(archivo) = rfd::AsyncFileDialog::new()
            .set_title("Foto de perfil")
            .add_filter("Imagen", &["jpg", "jpeg", "png", "webp"])
            .pick_file()
            .await
        else {
            return;
        };
        ocupado(&c2, true, "Subiendo la foto…");
        let bytes = archivo.read().await;
        let jpeg = tokio::task::spawn_blocking(move || a_jpeg(&bytes))
            .await
            .ok()
            .flatten();
        let Some(jpeg) = jpeg else {
            ocupado(&c2, false, "⚠ No se pudo leer la imagen");
            return;
        };
        let cuerpo = json!({ "imagen": base64::engine::general_purpose::STANDARD.encode(jpeg) });
        match c2.cliente.post::<Perfil>("/v1/yo/avatar", &cuerpo).await {
            Ok(p) => {
                recordar(&c2, p);
                ocupado(&c2, false, "Foto actualizada");
            }
            Err(e) => ocupado(&c2, false, &format!("⚠ {e}")),
        }
    });
}

fn a_jpeg(bytes: &[u8]) -> Option<Vec<u8>> {
    let img = image::load_from_memory(bytes).ok()?;
    let img = img.resize(LADO_FOTO, LADO_FOTO, image::imageops::FilterType::Triangle);
    let mut salida = Vec::new();
    img.to_rgb8()
        .write_to(
            &mut std::io::Cursor::new(&mut salida),
            image::ImageFormat::Jpeg,
        )
        .ok()?;
    Some(salida)
}

pub fn calzado(c: &Arc<Contexto>) {
    let c2 = c.clone();
    c.rt.spawn(async move {
        match c2
            .cliente
            .post::<Value>("/v1/explorador/calzado", &json!({}))
            .await
        {
            Ok(_) => ocupado(
                &c2,
                false,
                "Calzado nuevo registrado: el desgaste vuelve a 0 %",
            ),
            Err(e) => ocupado(&c2, false, &format!("⚠ {e}")),
        }
    });
}

pub fn contrasena(c: &Arc<Contexto>, actual: String, nueva: String) {
    ocupado(c, true, "");
    let c2 = c.clone();
    c.rt.spawn(async move {
        let cuerpo = json!({ "actual": actual, "nueva": nueva });
        match c2
            .cliente
            .post::<Value>("/v1/sesion/contrasena", &cuerpo)
            .await
        {
            Ok(_) => ocupado(&c2, false, "Contraseña cambiada"),
            Err(e) => ocupado(&c2, false, &format!("⚠ {e}")),
        }
    });
}

fn ocupado(c: &Contexto, si: bool, mensaje: &str) {
    let mensaje = mensaje.to_owned();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_perfil_ocupado(si);
        if !mensaje.is_empty() || !si {
            e.set_perfil_mensaje(mensaje.into());
        }
    })
    .ok();
}

// --- Taxonomía y etiquetas ------------------------------------------------------

pub fn taxonomia(c: &Arc<Contexto>) {
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_tax_mensaje("".into());
        e.set_tax_abierta(true);
    }
    let c2 = c.clone();
    c.rt.spawn(async move {
        let (catalogo, dashboard) = tokio::join!(
            c2.cliente.get::<Value>("/v1/catalogos"),
            c2.cliente.get::<Value>("/v1/dashboard"),
        );
        let catalogo = catalogo.unwrap_or_default();
        let por_categoria = dashboard
            .map(|d| d["objetos_por_categoria"].clone())
            .unwrap_or_default();
        let subs = catalogo["subcategorias"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let filas: Vec<CategoriaTax> = catalogo["categorias"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|k| {
                let id = k["id"].as_str().unwrap_or_default();
                let objetos = por_categoria
                    .as_array()
                    .into_iter()
                    .flatten()
                    .find(|p| p["categoria_id"].as_str() == Some(id))
                    .and_then(|p| p["total"].as_i64())
                    .unwrap_or(0);
                let nombres: Vec<&str> = subs
                    .iter()
                    .filter(|s| s["categoria_id"].as_str() == Some(id))
                    .filter_map(|s| s["nombre"].as_str())
                    .collect();
                CategoriaTax {
                    nombre: k["nombre"].as_str().unwrap_or_default().into(),
                    tono: color_hex(k["color"].as_str()),
                    objetos: objetos as i32,
                    subcategorias: nombres.join(" · ").into(),
                }
            })
            .collect();
        c2.ui
            .upgrade_in_event_loop(move |ui| {
                ui.global::<Estado>()
                    .set_tax_categorias(ModelRc::new(VecModel::from(filas)));
            })
            .ok();
        cargar_etiquetas(&c2).await;
    });
}

/// Mis etiquetas (para Taxonomía y el detalle de objetos).
pub async fn cargar_etiquetas(c: &Arc<Contexto>) -> Vec<Value> {
    let lista = c
        .cliente
        .get::<Vec<Value>>("/v1/etiquetas")
        .await
        .unwrap_or_default();
    let filas: Vec<EtiquetaSel> = lista.iter().map(|t| etiqueta(t, false)).collect();
    c.ui.upgrade_in_event_loop(move |ui| {
        ui.global::<Estado>()
            .set_etiquetas(ModelRc::new(VecModel::from(filas)));
    })
    .ok();
    lista
}

pub fn etiqueta(t: &Value, activa: bool) -> EtiquetaSel {
    EtiquetaSel {
        id: t["id"].as_str().unwrap_or_default().into(),
        nombre: t["nombre"].as_str().unwrap_or_default().into(),
        tono: color_hex(t["color"].as_str()),
        objetos: t["objetos"].as_i64().unwrap_or(0) as i32,
        activa,
    }
}

pub fn crear_etiqueta(c: &Arc<Contexto>, nombre: String, color: String) {
    let c2 = c.clone();
    c.rt.spawn(async move {
        let r = c2
            .cliente
            .post::<Value>(
                "/v1/etiquetas",
                &json!({ "nombre": nombre.trim(), "color": color }),
            )
            .await;
        let mensaje = match r {
            Ok(_) => String::new(),
            Err(e) => format!("⚠ {e}"),
        };
        c2.ui
            .upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_tax_mensaje(mensaje.into()))
            .ok();
        cargar_etiquetas(&c2).await;
    });
}

pub fn borrar_etiqueta(c: &Arc<Contexto>, id: String) {
    let c2 = c.clone();
    c.rt.spawn(async move {
        let _ = c2.cliente.borrar(&format!("/v1/etiquetas/{id}")).await;
        cargar_etiquetas(&c2).await;
    });
}

// --- Estado del sistema ---------------------------------------------------------

pub fn sistema(c: &Arc<Contexto>) {
    // Se lee aquí: fuera del hilo de la UI no se puede consultar la ventana
    let (en_vivo, enlace) = match c.ui.upgrade() {
        Some(ui) => {
            let e = ui.global::<Estado>();
            e.set_sis_cargando(true);
            e.set_sis_abierto(true);
            (e.get_en_vivo(), e.get_enlace().to_string())
        }
        None => return,
    };
    let c2 = c.clone();
    c.rt.spawn(async move {
        let inicio = std::time::Instant::now();
        let salud = c2.cliente.salud_detalle().await;
        let ms = inicio.elapsed().as_millis();
        let filas = filas_sistema(salud.as_ref().ok(), ms, en_vivo, &enlace, c2.cliente.base());
        c2.ui
            .upgrade_in_event_loop(move |ui| {
                let e = ui.global::<Estado>();
                e.set_sis_filas(ModelRc::new(VecModel::from(filas)));
                e.set_sis_cargando(false);
            })
            .ok();
    });
}

fn filas_sistema(
    salud: Option<&Value>,
    ms: u128,
    en_vivo: bool,
    enlace: &str,
    servidor: &str,
) -> Vec<FilaSistema> {
    let fila = |nombre: &str, detalle: String, estado: i32| FilaSistema {
        nombre: nombre.into(),
        detalle: detalle.into(),
        estado,
    };
    let mut filas = Vec::new();
    let Some(s) = salud else {
        filas.push(fila(
            "kepler-server",
            format!("{servidor} · no responde"),
            2,
        ));
        return filas;
    };
    filas.push(fila(
        "kepler-server",
        format!(
            "{servidor} · v{} · {ms} ms",
            s["version"].as_str().unwrap_or("?")
        ),
        i32::from(s["estado"] != "ok"),
    ));
    let bd = &s["base_datos"];
    filas.push(fila(
        "Base de datos",
        format!("PostgreSQL + PostGIS · {} ms", bd["latencia_ms"]),
        if bd["ok"] == true { 0 } else { 2 },
    ));
    for (i, o) in s["ollama"].as_array().into_iter().flatten().enumerate() {
        let nombre = if i == 0 {
            "IA · servidor principal"
        } else {
            "IA · respaldo"
        };
        let estado = match (o["ok"] == true, o["modelo_disponible"] == true) {
            (true, true) => 0,
            (true, false) => 1,
            _ => 2,
        };
        let detalle = match estado {
            0 => "en línea, modelo cargado",
            1 => "en línea, falta el modelo",
            _ => "sin respuesta",
        };
        filas.push(fila(
            nombre,
            format!("{} · {detalle}", o["url"].as_str().unwrap_or("?")),
            estado,
        ));
    }
    let v = &s["vision"];
    filas.push(fila(
        "Visión (YOLO + CLIP)",
        if v["ok"] == true {
            format!("{} clases", v["clases"])
        } else {
            "sin modelos: las capturas se guardan sin huella visual".into()
        },
        if v["ok"] == true { 0 } else { 1 },
    ));
    filas.push(fila(
        "En vivo",
        format!(
            "{} · {} · enlace {enlace}",
            if en_vivo { "conectado" } else { "reconectando" },
            match s["sesiones_en_vivo"].as_u64().unwrap_or(0) {
                1 => "1 sesión conectada".to_owned(),
                n => format!("{n} sesiones conectadas"),
            }
        ),
        if en_vivo { 0 } else { 1 },
    ));
    let dir = mapa::directorio_datos().join("mapas");
    let mapas: Vec<String> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "pmtiles"))
        .map(|e| {
            let mb = e.metadata().map(|m| m.len()).unwrap_or(0) as f64 / 1_048_576.0;
            format!("{} ({mb:.0} MB)", e.file_name().to_string_lossy())
        })
        .collect();
    filas.push(fila(
        "Mapa offline",
        if mapas.is_empty() {
            "sin descargar (se descarga al abrir el mapa)".into()
        } else {
            format!("{} · {}", mapas.join(", "), dir.display())
        },
        i32::from(mapas.is_empty()),
    ));
    filas
}

fn color_hex(s: Option<&str>) -> Color {
    s.and_then(|s| s.strip_prefix('#'))
        .and_then(|h| u32::from_str_radix(h, 16).ok())
        .map_or(Color::from_argb_encoded(0xff88_8888), |v| {
            Color::from_argb_encoded(0xff00_0000 | v)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sistema_sin_servidor_y_con_ia_de_respaldo_caida() {
        let f = filas_sistema(None, 0, false, "—", "http://x");
        assert_eq!((f.len(), f[0].estado), (1, 2));
        let salud = json!({
            "estado": "ok", "version": "0.8.0", "base_datos": { "ok": true, "latencia_ms": 1 },
            "ollama": [{ "url": "http://a", "ok": true, "modelo_disponible": true },
                       { "url": "http://b", "ok": false, "modelo_disponible": false }],
            "vision": { "ok": true, "clases": 80 }, "sesiones_en_vivo": 2
        });
        let f = filas_sistema(Some(&salud), 12, true, "12 ms", "http://x");
        let estados: Vec<i32> = f.iter().map(|x| x.estado).collect();
        assert_eq!(&estados[..5], &[0, 0, 0, 2, 0]);
    }

    #[test]
    fn reduce_la_foto_a_jpeg() {
        let mut png = Vec::new();
        image::RgbaImage::new(1600, 1200)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let jpeg = a_jpeg(&png).unwrap();
        assert!(jpeg.starts_with(&[0xFF, 0xD8]));
        let img = image::load_from_memory(&jpeg).unwrap();
        assert_eq!((img.width(), img.height()), (640, 480));
    }
}
