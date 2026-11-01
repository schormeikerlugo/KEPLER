//! Pantalla del mapa: descarga del PMTiles, cámara, capas, rastro y selección.

use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Local, Utc};
use serde_json::{Value, json};
use slint::{Color, ComponentHandle, ModelRc, SharedString, VecModel};

use crate::imagenes::{self, MINIATURA};
use crate::mapa::{self, Camara, Orden};
use crate::panel::Contexto;
use crate::{Estado, FilaRuta, SeleccionMapa};

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
    /// Planificador de rutas: los clics añaden puntos `(lat, lng)`.
    planificando: bool,
    plan: Vec<(f64, f64)>,
    /// Seguridad sugerida por el último análisis del corredor.
    plan_seguridad: Option<&'static str>,
}

#[derive(Clone, Copy)]
struct Capas {
    pois: bool,
    personas: bool,
    objetos: bool,
    alertas: bool,
    rutas: bool,
}

impl Default for Capas {
    fn default() -> Self {
        Self {
            pois: true,
            personas: true,
            objetos: true,
            alertas: true,
            rutas: true,
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
            "ruta" => self.rutas,
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
        rutas: e.get_capa_rutas(),
    };
    m.enviar_elementos();
}

/// El punto visible más cercano al clic, si está a menos de `RADIO_CLIC` px.
pub fn clic(c: &Arc<Contexto>, x: f32, y: f32) {
    {
        let mut m = c.mapa.lock().expect("mapa");
        if m.planificando {
            let (w, h) = m.tamano;
            let camara = m.camara();
            let (cx, cy) = camara.proyectar(camara.lat, camara.lng);
            let punto =
                camara.desproyectar(cx + f64::from(x) - w / 2.0, cy + f64::from(y) - h / 2.0);
            m.plan.push(punto);
            m.plan_seguridad = None;
            pintar_plan(c, &m, None);
            return;
        }
    }
    let elegido = {
        let m = c.mapa.lock().expect("mapa");
        let camara = m.camara();
        let (w, h) = m.tamano;
        m.visibles()
            .filter(|f| f["geometry"]["type"] == "Point")
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

// --- Planificador de rutas --------------------------------------------------------

pub fn plan_alternar(c: &Arc<Contexto>) {
    let mut m = c.mapa.lock().expect("mapa");
    m.planificando = !m.planificando;
    pintar_plan(c, &m, None);
}

pub fn plan_deshacer(c: &Arc<Contexto>) {
    let mut m = c.mapa.lock().expect("mapa");
    m.plan.pop();
    m.plan_seguridad = None;
    pintar_plan(c, &m, None);
}

pub fn plan_limpiar(c: &Arc<Contexto>) {
    let mut m = c.mapa.lock().expect("mapa");
    m.plan.clear();
    m.plan_seguridad = None;
    pintar_plan(c, &m, None);
}

/// Hallazgos y peligros a 200 m del trazado (`/v1/rutas/analizar`).
pub fn plan_analizar(c: &Arc<Contexto>) {
    let puntos = c.mapa.lock().expect("mapa").plan.clone();
    if puntos.len() < 2 {
        return;
    }
    mensaje_plan(c, "Analizando el corredor…", true);
    let c2 = c.clone();
    c.rt.spawn(async move {
        let waypoints: Vec<[f64; 2]> = puntos.iter().map(|&(lat, lng)| [lat, lng]).collect();
        let r = c2
            .cliente
            .post::<Value>(
                "/v1/rutas/analizar",
                &json!({ "waypoints": waypoints, "corredor_m": 200 }),
            )
            .await;
        match r {
            Ok(a) => {
                let mut m = c2.mapa.lock().expect("mapa");
                m.plan_seguridad = Some(match a["riesgo"]["nivel"].as_str() {
                    Some("bajo") => "seguro",
                    Some("medio") => "precaucion",
                    _ => "peligro",
                });
                pintar_plan(&c2, &m, Some(&a));
                mensaje_plan(&c2, "", false);
            }
            Err(e) => mensaje_plan(&c2, &format!("⚠ {e}"), false),
        }
    });
}

/// Guarda la ruta planificada (privada) con la seguridad del análisis.
pub fn plan_guardar(c: &Arc<Contexto>, nombre: String) {
    let (puntos, seguridad) = {
        let m = c.mapa.lock().expect("mapa");
        (m.plan.clone(), m.plan_seguridad.unwrap_or("desconocido"))
    };
    let nombre = nombre.trim().to_owned();
    if puntos.len() < 2 || nombre.is_empty() {
        mensaje_plan(c, "Pon un nombre y al menos dos puntos", false);
        return;
    }
    let c2 = c.clone();
    c.rt.spawn(async move {
        let ahora = Utc::now();
        let fila = json!({
            "id": kepler_core::nuevo_id(), "nombre": nombre, "origen": "planificada",
            "seguridad": seguridad, "distancia_km": (longitud_km(&puntos) * 100.0).round() / 100.0,
            "waypoints": puntos.iter().map(|&(lat, lng)| [lat, lng]).collect::<Vec<_>>(),
            "creado_en": ahora, "actualizado_en": ahora, "version": 1,
        });
        match c2
            .cliente
            .post::<Value>("/v1/sync/subir", &json!({ "rutas": [fila] }))
            .await
        {
            Ok(r) if r["rechazados"].as_array().is_none_or(Vec::is_empty) => {
                {
                    let mut m = c2.mapa.lock().expect("mapa");
                    m.plan.clear();
                    m.planificando = false;
                    m.plan_seguridad = None;
                    pintar_plan(&c2, &m, None);
                }
                mensaje_plan(&c2, &format!("Ruta «{nombre}» guardada"), false);
                recargar(&c2).await;
            }
            Ok(r) => mensaje_plan(
                &c2,
                &format!("⚠ Rechazada: {}", r["rechazados"][0]["motivo"]),
                false,
            ),
            Err(e) => mensaje_plan(&c2, &format!("⚠ {e}"), false),
        }
    });
}

fn longitud_km(puntos: &[(f64, f64)]) -> f64 {
    puntos
        .windows(2)
        .filter_map(|w| {
            let a = kepler_core::Coordenada::new(w[0].0, w[0].1).ok()?;
            let b = kepler_core::Coordenada::new(w[1].0, w[1].1).ok()?;
            Some(a.distancia_m(&b))
        })
        .sum::<f64>()
        / 1000.0
}

/// Dibuja el plan en el mapa y su resumen (y el análisis, si lo hay) en el panel.
fn pintar_plan(c: &Contexto, m: &Memoria, analisis: Option<&Value>) {
    let coords: Vec<[f64; 2]> = m.plan.iter().map(|&(lat, lng)| [lng, lat]).collect();
    let mut features: Vec<Value> = coords
        .iter()
        .map(|p| json!({ "type": "Feature", "properties": {}, "geometry": { "type": "Point", "coordinates": p } }))
        .collect();
    if coords.len() > 1 {
        features.push(json!({ "type": "Feature", "properties": {},
                              "geometry": { "type": "LineString", "coordinates": coords } }));
    }
    m.enviar(Orden::Plan(
        json!({ "type": "FeatureCollection", "features": features }).to_string(),
    ));

    let activo = m.planificando;
    let n = m.plan.len() as i32;
    let km = format!("{:.2} km", longitud_km(&m.plan));
    let (riesgo, tono, filas) = match analisis {
        Some(a) => {
            let nivel = a["riesgo"]["nivel"].as_str().unwrap_or("bajo");
            let tono = match nivel {
                "critico" => 0xFF4444,
                "alto" => 0xFF8844,
                "medio" => 0xFFBB33,
                _ => 0x00D4AA,
            };
            let nivel_txt = if nivel == "critico" {
                "CRÍTICO".to_owned()
            } else {
                nivel.to_uppercase()
            };
            (
                format!("RIESGO {nivel_txt} · {} PUNTOS", a["riesgo"]["puntuacion"]),
                Color::from_argb_encoded(0xff00_0000 | tono),
                filas_analisis(a),
            )
        }
        None => (
            String::new(),
            Color::from_argb_encoded(0xff99_9999),
            Vec::new(),
        ),
    };
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_plan_activo(activo);
        e.set_plan_puntos(n);
        e.set_plan_km(km.into());
        e.set_plan_riesgo(riesgo.into());
        e.set_plan_tono(tono);
        e.set_plan_hallazgos(ModelRc::new(VecModel::from(filas)));
    })
    .ok();
}

/// Lo encontrado en el corredor.
fn filas_analisis(a: &Value) -> Vec<FilaRuta> {
    let rgb = |v: u32| Color::from_argb_encoded(0xff00_0000 | v);
    let mut filas = Vec::new();
    let grupos = [
        ("puntos_interes", "POI"),
        ("personas", "PERSONA"),
        ("objetos", "OBJETO"),
        ("rutas", "RUTA"),
    ];
    for (clave, tipo) in grupos {
        for x in a[clave].as_array().into_iter().flatten().take(6) {
            let detalle = x["detalle"].as_str().unwrap_or_default();
            let tono = match detalle {
                "critico" | "hostil" | "peligro" => 0xFF4444,
                "alto" => 0xFF8844,
                "medio" | "precaucion" => 0xFFBB33,
                _ => 0x3FA8FF,
            };
            let autor = x["autor"]
                .as_str()
                .map(|a| format!(" · @{a}"))
                .unwrap_or_default();
            filas.push(FilaRuta {
                nombre: x["nombre"].as_str().unwrap_or_default().into(),
                detalle: format!(
                    "{tipo} a {:.0} m{autor}",
                    x["distancia_m"].as_f64().unwrap_or(0.0)
                )
                .into(),
                seguridad: if detalle == "critico" {
                    "crítico"
                } else {
                    detalle
                }
                .into(),
                tono: rgb(tono),
            });
        }
    }
    filas
}

fn mensaje_plan(c: &Contexto, texto: &str, analizando: bool) {
    let texto = texto.to_owned();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_plan_mensaje(texto.into());
        e.set_plan_analizando(analizando);
    })
    .ok();
}

/// Unidades de Campo en vivo (solo si el mapa ya está listo).
pub fn unidades(c: &Contexto, geojson: String) {
    c.mapa
        .lock()
        .expect("mapa")
        .enviar(Orden::Unidades(geojson));
}

/// Lleva la cámara a un punto (p. ej. la posición de una Unidad de Campo).
pub fn centrar_en(c: &Contexto, lat: f64, lng: f64) {
    let mut m = c.mapa.lock().expect("mapa");
    let camara = Camara {
        lat,
        lng,
        zoom: m.camara().zoom.max(15.0),
    };
    m.camara = Some(camara);
    m.enviar(Orden::Camara(camara));
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
