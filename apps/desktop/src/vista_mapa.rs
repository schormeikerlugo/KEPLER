//! Pantalla del mapa: descarga del PMTiles, cámara, capas, rastro y selección.

use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Local, Utc};
use serde_json::{Value, json};
use slint::{Color, ComponentHandle, ModelRc, SharedString, VecModel};

use crate::imagenes::{self, MINIATURA};
use crate::mapa::{self, Camara, Orden};
use crate::panel::Contexto;
use crate::{Estado, SeleccionMapa};

/// Caracas, si no se sabe dónde está el explorador.
const INICIO: Camara = Camara {
    lat: 10.49,
    lng: -66.88,
    zoom: 12.0,
};
/// Radio en píxeles para elegir un punto con el ratón.
const RADIO_CLIC: f64 = 14.0;

#[derive(Default)]
pub struct Memoria {
    orden: Option<Sender<Orden>>,
    iniciado: bool,
    camara: Option<Camara>,
    tamano: (f64, f64),
    elementos: Vec<Value>,
    capas: Capas,
    misiones: Vec<String>,
}

#[derive(Clone, Copy)]
struct Capas {
    pois: bool,
    personas: bool,
    objetos: bool,
    alertas: bool,
}

impl Default for Capas {
    fn default() -> Self {
        Self {
            pois: true,
            personas: true,
            objetos: true,
            alertas: true,
        }
    }
}

impl Capas {
    fn muestra(self, tipo: &str) -> bool {
        match tipo {
            "poi" => self.pois,
            "persona" => self.personas,
            "objeto" => self.objetos,
            "alerta" => self.alertas,
            _ => false,
        }
    }
}

pub type Compartida = Mutex<Memoria>;

impl Memoria {
    fn enviar(&self, o: Orden) {
        if let Some(tx) = &self.orden {
            let _ = tx.send(o);
        }
    }

    fn camara(&self) -> Camara {
        self.camara.unwrap_or(INICIO)
    }

    fn visibles(&self) -> impl Iterator<Item = &Value> {
        let capas = self.capas;
        self.elementos
            .iter()
            .filter(move |f| capas.muestra(f["properties"]["tipo"].as_str().unwrap_or_default()))
    }

    fn enviar_elementos(&self) {
        let features: Vec<&Value> = self.visibles().collect();
        self.enviar(Orden::Elementos(
            json!({ "type": "FeatureCollection", "features": features }).to_string(),
        ));
    }
}

/// Al abrir la pestaña: la primera vez prepara el mapa offline y el hilo de render.
pub fn entrar(c: &Arc<Contexto>) {
    let primera = {
        let mut m = c.mapa.lock().expect("mapa");
        !std::mem::replace(&mut m.iniciado, true)
    };
    let c2 = c.clone();
    c.rt.spawn(async move {
        if primera {
            preparar(&c2).await;
        }
        tokio::join!(recargar(&c2), cargar_misiones(&c2));
    });
}

async fn preparar(c: &Arc<Contexto>) {
    let aviso = |texto: String, progreso: f32| {
        c.ui.upgrade_in_event_loop(move |ui| {
            let e = ui.global::<Estado>();
            e.set_mapa_aviso(texto.into());
            e.set_mapa_progreso(progreso);
        })
        .ok();
    };
    let regiones = match c.cliente.get::<Vec<Value>>("/v1/mapas").await {
        Ok(r) if !r.is_empty() => r,
        Ok(_) => {
            return aviso(
                "El servidor no tiene mapas offline (KEPLER_MAPAS_DIR).".into(),
                -1.0,
            );
        }
        Err(e) => return aviso(format!("No se pudo consultar los mapas: {e}"), -1.0),
    };
    let region = &regiones[0];
    let (id, url) = (
        region["id"].as_str().unwrap_or("mapa"),
        region["url"].as_str().unwrap_or_default(),
    );
    let datos = mapa::directorio_datos();
    let archivo = datos.join("mapas").join(format!("{id}.pmtiles"));
    let _ = tokio::fs::create_dir_all(archivo.parent().unwrap_or(&datos)).await;

    let local = tokio::fs::metadata(&archivo).await.map(|m| m.len()).ok();
    match c.cliente.tamano_remoto(url).await {
        Ok(remoto) if local != Some(remoto) => {
            let mb = remoto as f64 / 1_048_576.0;
            aviso(
                format!("Descargando el mapa offline «{id}» ({mb:.0} MB)…"),
                0.0,
            );
            let ultimo = std::sync::atomic::AtomicU64::new(0);
            let r = c
                .cliente
                .descargar(url, &archivo, |hecho, total| {
                    // Avisar a la UI cada ~1 %
                    let paso = total.max(1) / 100;
                    if hecho - ultimo.load(std::sync::atomic::Ordering::Relaxed) >= paso {
                        ultimo.store(hecho, std::sync::atomic::Ordering::Relaxed);
                        aviso(
                            format!(
                                "Descargando el mapa offline «{id}»: {:.0} de {mb:.0} MB",
                                hecho as f64 / 1_048_576.0
                            ),
                            hecho as f32 / total.max(1) as f32,
                        );
                    }
                })
                .await;
            if let Err(e) = r {
                return aviso(format!("Falló la descarga del mapa: {e}"), -1.0);
            }
        }
        Ok(_) => {}
        // Sin servidor: se usa lo que haya en disco
        Err(_) if local.is_some() => {}
        Err(e) => return aviso(format!("No se pudo descargar el mapa: {e}"), -1.0),
    }
    aviso(String::new(), -1.0);

    let ui = c.ui.clone();
    let ui2 = c.ui.clone();
    let tx = mapa::lanzar(
        &archivo,
        &datos,
        move |fotograma| {
            ui.upgrade_in_event_loop(move |ui| {
                let e = ui.global::<Estado>();
                e.set_mapa_imagen(slint::Image::from_rgba8(fotograma));
                e.set_mapa_listo(true);
            })
            .ok();
        },
        move |error| {
            ui2.upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_mapa_aviso(error.into()))
                .ok();
        },
    );
    let inicio = c
        .ubicacion_aproximada()
        .await
        .map_or(INICIO, |(lat, lng)| Camara {
            lat,
            lng,
            zoom: 12.0,
        });
    let mut m = c.mapa.lock().expect("mapa");
    m.camara.get_or_insert(inicio);
    let (w, h) = m.tamano;
    let _ = tx.send(Orden::Tamano(w as u32, h as u32));
    let _ = tx.send(Orden::Camara(m.camara()));
    m.orden = Some(tx);
    m.enviar_elementos();
    let zoom = m.camara().zoom as f32;
    c.ui.upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_mapa_zoom(zoom))
        .ok();
}

/// Vuelve a pedir los elementos (al entrar y ante novedades en vivo).
pub async fn recargar(c: &Arc<Contexto>) {
    if !c.mapa.lock().expect("mapa").iniciado {
        return;
    }
    if let Ok(g) = c.cliente.get::<Value>("/v1/mapa/elementos").await {
        let mut m = c.mapa.lock().expect("mapa");
        m.elementos = g["features"].as_array().cloned().unwrap_or_default();
        m.enviar_elementos();
    }
}

async fn cargar_misiones(c: &Arc<Contexto>) {
    let Ok(lista) = c.cliente.get::<Vec<Value>>("/v1/misiones?limite=100").await else {
        return;
    };
    let mut nombres = vec!["Ninguno".to_owned()];
    let mut ids = vec![String::new()];
    for m in lista {
        let titulo = m["titulo"]
            .as_str()
            .filter(|t| !t.is_empty())
            .or(m["codigo"].as_str())
            .unwrap_or("?");
        nombres.push(titulo.to_owned());
        ids.push(m["id"].as_str().unwrap_or_default().to_owned());
    }
    c.mapa.lock().expect("mapa").misiones = ids;
    c.ui.upgrade_in_event_loop(move |ui| {
        let modelo: Vec<SharedString> = nombres.into_iter().map(Into::into).collect();
        ui.global::<Estado>()
            .set_mapa_misiones(ModelRc::new(VecModel::from(modelo)));
    })
    .ok();
}

// --- Llamadas desde la UI (hilo de Slint) --------------------------------------

pub fn tamano(c: &Contexto, w: f32, h: f32) {
    let mut m = c.mapa.lock().expect("mapa");
    m.tamano = (f64::from(w), f64::from(h));
    m.enviar(Orden::Tamano(w as u32, h as u32));
    let camara = m.camara();
    m.enviar(Orden::Camara(camara));
}

pub fn mover(c: &Contexto, dx: f32, dy: f32) {
    let mut m = c.mapa.lock().expect("mapa");
    let mut camara = m.camara();
    camara.mover(f64::from(dx), f64::from(dy));
    m.camara = Some(camara);
    m.enviar(Orden::Camara(camara));
}

/// Zoom (rueda, doble clic o botones) manteniendo el punto bajo el cursor.
pub fn rueda(c: &Contexto, e: &Estado<'_>, delta: f32, x: f32, y: f32) {
    let mut m = c.mapa.lock().expect("mapa");
    let (w, h) = m.tamano;
    let mut camara = m.camara();
    camara.acercar(f64::from(delta), f64::from(x), f64::from(y), w, h);
    m.camara = Some(camara);
    m.enviar(Orden::Camara(camara));
    e.set_mapa_zoom(camara.zoom as f32);
}

pub fn capas(c: &Contexto, e: &Estado<'_>) {
    let mut m = c.mapa.lock().expect("mapa");
    m.capas = Capas {
        pois: e.get_capa_pois(),
        personas: e.get_capa_personas(),
        objetos: e.get_capa_objetos(),
        alertas: e.get_capa_alertas(),
    };
    m.enviar_elementos();
}

/// El punto visible más cercano al clic, si está a menos de `RADIO_CLIC` px.
pub fn clic(c: &Arc<Contexto>, x: f32, y: f32) {
    let elegido = {
        let m = c.mapa.lock().expect("mapa");
        let camara = m.camara();
        let (w, h) = m.tamano;
        m.visibles()
            .filter_map(|f| {
                let p = &f["geometry"]["coordinates"];
                let (px, py) = camara.en_vista(p[1].as_f64()?, p[0].as_f64()?, w, h);
                let d = (px - f64::from(x)).hypot(py - f64::from(y));
                (d <= RADIO_CLIC).then_some((d, f["properties"].clone()))
            })
            .min_by(|a, b| a.0.total_cmp(&b.0))
            .map(|(_, p)| p)
    };
    let Some(p) = elegido else {
        cerrar_seleccion(c);
        return;
    };
    let (tipo, detalle, tono) = describir(&p);
    let fecha = p["capturado_en"]
        .as_str()
        .and_then(|f| f.parse::<DateTime<Utc>>().ok())
        .map(|f| {
            f.with_timezone(&Local)
                .format("%d/%m/%Y · %H:%M")
                .to_string()
        })
        .unwrap_or_default();
    let nombre = p["nombre"].as_str().unwrap_or_default().to_owned();
    if let Some(ui) = c.ui.upgrade() {
        ui.global::<Estado>().set_mapa_seleccion(SeleccionMapa {
            visible: true,
            tipo: tipo.into(),
            nombre: nombre.into(),
            detalle: detalle.into(),
            tono,
            fecha: fecha.into(),
            imagen: Default::default(),
            tiene_imagen: false,
        });
    }
    if let Some(ruta) = p["imagen_path"].as_str().map(str::to_owned) {
        let c2 = c.clone();
        c.rt.spawn(async move {
            let Some(px) = c2.imagenes.obtener(&c2.cliente, &ruta, MINIATURA * 2).await else {
                return;
            };
            c2.ui
                .upgrade_in_event_loop(move |ui| {
                    let e = ui.global::<Estado>();
                    let mut s = e.get_mapa_seleccion();
                    // Solo si sigue elegido el mismo
                    if s.visible && s.nombre == p["nombre"].as_str().unwrap_or_default() {
                        s.imagen = imagenes::a_imagen(px);
                        s.tiene_imagen = true;
                        e.set_mapa_seleccion(s);
                    }
                })
                .ok();
        });
    }
}

pub fn cerrar_seleccion(c: &Contexto) {
    if let Some(ui) = c.ui.upgrade() {
        ui.global::<Estado>()
            .set_mapa_seleccion(SeleccionMapa::default());
    }
}

fn describir(p: &Value) -> (String, String, Color) {
    let rgb = |v: u32| Color::from_argb_encoded(0xff00_0000 | v);
    let nivel = p["nivel"].as_str().unwrap_or_default();
    let autor = match p["autor"].as_str() {
        Some(a) if p["propio"] != true => format!(" · reportado por @{a}"),
        _ => String::new(),
    };
    match p["tipo"].as_str().unwrap_or_default() {
        "poi" => {
            let tono = match nivel {
                "critico" => rgb(0xFF4444),
                "alto" => rgb(0xFF8844),
                "medio" => rgb(0xFFBB33),
                _ => rgb(0x9BD66B),
            };
            let nivel = if nivel == "critico" {
                "crítico"
            } else {
                nivel
            };
            let propio = if p["propio"] == true {
                ""
            } else {
                " (compartido)"
            };
            (
                format!("PUNTO DE INTERÉS{propio}"),
                format!("Riesgo {nivel}{autor}"),
                tono,
            )
        }
        "alerta" => (
            "ALERTA DE OTRO EXPLORADOR".into(),
            format!("Persona hostil{autor}"),
            rgb(0xFF4444),
        ),
        "persona" => {
            let tono = match nivel {
                "hostil" => rgb(0xFF4444),
                "aliado" => rgb(0x00D4AA),
                "neutral" => rgb(0x3FA8FF),
                _ => rgb(0x999999),
            };
            ("PERSONA".into(), format!("Hostilidad: {nivel}"), tono)
        }
        _ => {
            let clase = if nivel.is_empty() {
                String::new()
            } else {
                format!("Detectado como «{nivel}»")
            };
            ("OBJETO".into(), clase, rgb(0x00D4AA))
        }
    }
}

pub fn centrar(c: &Arc<Contexto>) {
    let c2 = c.clone();
    c.rt.spawn(async move {
        let Some((lat, lng)) = c2.ubicacion_aproximada().await else {
            return;
        };
        let mut m = c2.mapa.lock().expect("mapa");
        let zoom = m.camara().zoom.max(13.0);
        let camara = Camara { lat, lng, zoom };
        m.camara = Some(camara);
        m.enviar(Orden::Camara(camara));
        c2.ui
            .upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_mapa_zoom(zoom as f32))
            .ok();
    });
}

/// Dibuja el rastro de la misión `indice` del selector y encuadra la cámara.
pub fn elegir_mision(c: &Arc<Contexto>, indice: i32) {
    let id = {
        let m = c.mapa.lock().expect("mapa");
        usize::try_from(indice)
            .ok()
            .and_then(|i| m.misiones.get(i))
            .cloned()
            .unwrap_or_default()
    };
    let info = |c: &Arc<Contexto>, texto: String| {
        c.ui.upgrade_in_event_loop(move |ui| {
            ui.global::<Estado>().set_mapa_rastro_info(texto.into())
        })
        .ok();
    };
    if id.is_empty() {
        c.mapa.lock().expect("mapa").enviar(Orden::Rastro(
            json!({ "type": "FeatureCollection", "features": [] }).to_string(),
        ));
        info(c, String::new());
        return;
    }
    let c2 = c.clone();
    c.rt.spawn(async move {
        let puntos = c2
            .cliente
            .get::<Vec<Value>>(&format!("/v1/misiones/{id}/rastro"))
            .await
            .unwrap_or_default();
        let coords: Vec<(f64, f64)> = puntos
            .iter()
            .filter_map(|p| Some((p["lat"].as_f64()?, p["lng"].as_f64()?)))
            .collect();
        if coords.is_empty() {
            info(&c2, "Sin rastro GPS".into());
            return;
        }
        let linea: Vec<[f64; 2]> = coords.iter().map(|&(lat, lng)| [lng, lat]).collect();
        let km: f64 = coords
            .windows(2)
            .map(|w| {
                kepler_core::Coordenada::new(w[0].0, w[0].1)
                    .and_then(|a| Ok(a.distancia_m(&kepler_core::Coordenada::new(w[1].0, w[1].1)?)))
                    .unwrap_or(0.0)
            })
            .sum::<f64>()
            / 1000.0;
        let geojson = json!({ "type": "Feature", "properties": {},
                              "geometry": { "type": "LineString", "coordinates": linea } });
        let mut m = c2.mapa.lock().expect("mapa");
        m.enviar(Orden::Rastro(geojson.to_string()));
        let camara = encuadrar(&coords, m.tamano);
        m.camara = Some(camara);
        m.enviar(Orden::Camara(camara));
        drop(m);
        info(&c2, format!("{} puntos · {km:.2} km", coords.len()));
        c2.ui
            .upgrade_in_event_loop(move |ui| {
                ui.global::<Estado>().set_mapa_zoom(camara.zoom as f32)
            })
            .ok();
    });
}

/// Cámara que muestra todos los puntos con margen.
fn encuadrar(puntos: &[(f64, f64)], (w, h): (f64, f64)) -> Camara {
    let base = Camara {
        lat: 0.0,
        lng: 0.0,
        zoom: 0.0,
    };
    let proyectados: Vec<(f64, f64)> = puntos
        .iter()
        .map(|&(lat, lng)| base.proyectar(lat, lng))
        .collect();
    let (min_x, max_x) = proyectados
        .iter()
        .fold((f64::MAX, f64::MIN), |a, p| (a.0.min(p.0), a.1.max(p.0)));
    let (min_y, max_y) = proyectados
        .iter()
        .fold((f64::MAX, f64::MIN), |a, p| (a.0.min(p.1), a.1.max(p.1)));
    let margen = 0.7;
    let zoom = ((w * margen) / (max_x - min_x).max(1e-9))
        .min((h * margen) / (max_y - min_y).max(1e-9))
        .log2()
        .clamp(mapa::ZOOM_MIN, 17.0);
    let (lat, lng) = base.desproyectar((min_x + max_x) / 2.0, (min_y + max_y) / 2.0);
    Camara { lat, lng, zoom }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encuadre_contiene_los_puntos() {
        let puntos = [(10.48, -66.90), (10.52, -66.85)];
        let c = encuadrar(&puntos, (1000.0, 700.0));
        for (lat, lng) in puntos {
            let (x, y) = c.en_vista(lat, lng, 1000.0, 700.0);
            assert!(
                (0.0..=1000.0).contains(&x) && (0.0..=700.0).contains(&y),
                "{x},{y}"
            );
        }
        assert!(c.zoom > 11.0 && c.zoom < 15.0, "{}", c.zoom);
    }
}
