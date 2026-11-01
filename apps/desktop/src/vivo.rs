//! Vista en vivo de las Unidades de Campo: lo que reenvía el servidor (GPS,
//! estado del dispositivo, fotogramas y detecciones), por unidad.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use kepler_proto::Contenido;
use kepler_proto::v1::{Detecciones, EstadoDispositivo, MuestraGps, OrigenDeteccion, Red};
use serde_json::json;
use slint::{Color, ComponentHandle, ModelRc, VecModel};
use uuid::Uuid;

use crate::imagenes::Pixeles;
use crate::panel::Contexto;
use crate::{CajaVivo, DatoIndicador, Estado, UnidadVivo, vista_mapa};

/// Sin mensajes en este tiempo, la unidad se da por desconectada.
const SILENCIO: Duration = Duration::from_secs(10);
/// Puntos de recorrido que se guardan por unidad (para el mapa).
const RECORRIDO_MAX: usize = 2000;
/// Unas detecciones valen para los fotogramas cercanos; viejas, se borran.
const DETECCIONES_VIGENCIA: Duration = Duration::from_millis(800);

struct Unidad {
    numero: usize,
    visto: Instant,
    gps: Option<MuestraGps>,
    recorrido: Vec<[f64; 2]>,
    dispositivo: Option<EstadoDispositivo>,
    fotogramas: VecDeque<Instant>,
    ultimo_fotograma: u64,
    detecciones: Option<(Detecciones, Instant)>,
}

impl Unidad {
    fn activa(&self) -> bool {
        self.visto.elapsed() < SILENCIO
    }

    fn fps(&self) -> f64 {
        let n = self.fotogramas.len();
        match (self.fotogramas.front(), self.fotogramas.back()) {
            (Some(a), Some(b)) if n > 1 => {
                (n - 1) as f64 / b.duration_since(*a).as_secs_f64().max(0.001)
            }
            _ => 0.0,
        }
    }
}

#[derive(Default)]
pub struct Memoria {
    unidades: HashMap<Uuid, Unidad>,
    seleccion: Option<Uuid>,
}

pub struct Vivo {
    memoria: Mutex<Memoria>,
    /// Un fotograma decodificándose: los que lleguen mientras tanto se descartan.
    decodificando: AtomicBool,
}

impl Default for Vivo {
    fn default() -> Self {
        Self {
            memoria: Mutex::default(),
            decodificando: AtomicBool::new(false),
        }
    }
}

pub fn olvidar(c: &Contexto, e: &Estado<'_>) {
    *c.vivo.memoria.lock().expect("vivo") = Memoria::default();
    e.set_vivo_unidades(ModelRc::default());
    e.set_vivo_activas(0);
    e.set_vivo_hay_imagen(false);
    e.set_vivo_cajas(ModelRc::default());
}

/// Un mensaje de campo recibido por el WebSocket (hilo de tokio).
pub fn recibir(c: &Arc<Contexto>, origen: Uuid, contenido: Contenido) {
    let mut m = c.vivo.memoria.lock().expect("vivo");
    let nueva = !m.unidades.contains_key(&origen);
    let numero = m.unidades.len() + 1;
    let u = m.unidades.entry(origen).or_insert_with(|| Unidad {
        numero,
        visto: Instant::now(),
        gps: None,
        recorrido: Vec::new(),
        dispositivo: None,
        fotogramas: VecDeque::new(),
        ultimo_fotograma: 0,
        detecciones: None,
    });
    let reactivada = !u.activa();
    u.visto = Instant::now();
    if m.seleccion.is_none() {
        m.seleccion = Some(origen);
    }
    let elegida = m.seleccion == Some(origen);
    let u = m.unidades.get_mut(&origen).expect("recién insertada");

    match contenido {
        Contenido::Fotograma(f) => {
            u.fotogramas.push_back(Instant::now());
            while u.fotogramas.len() > 20 {
                u.fotogramas.pop_front();
            }
            u.ultimo_fotograma = f.numero;
            if elegida && !c.vivo.decodificando.swap(true, Ordering::AcqRel) {
                let c2 = c.clone();
                let pie = pie(u);
                c.rt.spawn_blocking(move || {
                    let px = crate::imagenes::decodificar(&f.jpeg, 1280);
                    c2.vivo.decodificando.store(false, Ordering::Release);
                    if let Some(px) = px {
                        mostrar_fotograma(&c2, px, pie);
                    }
                });
            }
        }
        Contenido::Detecciones(d) => {
            u.detecciones = Some((d, Instant::now()));
            if elegida {
                let cajas = cajas(u);
                c.ui.upgrade_in_event_loop(move |ui| {
                    ui.global::<Estado>()
                        .set_vivo_cajas(ModelRc::new(VecModel::from(cajas)));
                })
                .ok();
            }
        }
        Contenido::Gps(g) => {
            u.recorrido.push([g.lng, g.lat]);
            if u.recorrido.len() > RECORRIDO_MAX {
                u.recorrido.remove(0);
            }
            u.gps = Some(g);
            vista_mapa::unidades(c, geojson_unidades(&m));
            if elegida {
                refrescar_telemetria(c, &m);
            }
        }
        Contenido::Dispositivo(d) => {
            u.dispositivo = Some(d);
            if elegida {
                refrescar_telemetria(c, &m);
            }
        }
        _ => {}
    }
    if nueva || reactivada {
        refrescar_unidades(c, &m);
    }
}

/// Cada pocos segundos: unidades que dejaron de hablar y cajas caducadas.
pub fn vigilar(c: &Arc<Contexto>) {
    let c = c.clone();
    let rt = c.rt.clone();
    rt.spawn(async move {
        let mut intervalo = tokio::time::interval(Duration::from_secs(2));
        loop {
            intervalo.tick().await;
            let m = c.vivo.memoria.lock().expect("vivo");
            if m.unidades.is_empty() {
                continue;
            }
            refrescar_unidades(&c, &m);
            let caducadas = m
                .seleccion
                .and_then(|s| m.unidades.get(&s))
                .is_some_and(|u| {
                    u.detecciones
                        .as_ref()
                        .is_none_or(|(_, t)| t.elapsed() > DETECCIONES_VIGENCIA)
                });
            if caducadas {
                c.ui.upgrade_in_event_loop(|ui| {
                    ui.global::<Estado>().set_vivo_cajas(ModelRc::default())
                })
                .ok();
            }
        }
    });
}

pub fn elegir(c: &Arc<Contexto>, id: &str) {
    let Ok(id) = id.parse::<Uuid>() else { return };
    let mut m = c.vivo.memoria.lock().expect("vivo");
    if m.unidades.contains_key(&id) {
        m.seleccion = Some(id);
        refrescar_unidades(c, &m);
        refrescar_telemetria(c, &m);
        c.ui.upgrade_in_event_loop(|ui| {
            let e = ui.global::<Estado>();
            e.set_vivo_hay_imagen(false);
            e.set_vivo_cajas(ModelRc::default());
        })
        .ok();
    }
}

/// Centra el mapa en la unidad elegida y cambia a la pestaña del mapa.
pub fn ver_en_mapa(c: &Arc<Contexto>) -> bool {
    let m = c.vivo.memoria.lock().expect("vivo");
    let Some(g) = m
        .seleccion
        .and_then(|s| m.unidades.get(&s))
        .and_then(|u| u.gps.as_ref())
    else {
        return false;
    };
    vista_mapa::centrar_en(c, g.lat, g.lng);
    vista_mapa::unidades(c, geojson_unidades(&m));
    true
}

fn mostrar_fotograma(c: &Contexto, px: Pixeles, pie: String) {
    let aspecto = px.width() as f32 / px.height().max(1) as f32;
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_vivo_imagen(slint::Image::from_rgba8(px));
        e.set_vivo_aspecto(aspecto);
        e.set_vivo_hay_imagen(true);
        e.set_vivo_pie(pie.into());
    })
    .ok();
}

fn pie(u: &Unidad) -> String {
    let mut partes = vec![
        format!("FOTOGRAMA {}", u.ultimo_fotograma),
        format!("{:.0} FPS", u.fps()),
    ];
    if let Some((d, _)) = &u.detecciones {
        let origen = if d.origen() == OrigenDeteccion::Servidor {
            "SERVIDOR"
        } else {
            "IPHONE"
        };
        partes.push(format!("YOLO {origen} {:.0} MS", d.latencia_ms));
        partes.push(format!("{} OBJETOS", d.items.len()));
    }
    partes.join("  ·  ")
}

fn cajas(u: &Unidad) -> Vec<CajaVivo> {
    let Some((d, _)) = &u.detecciones else {
        return Vec::new();
    };
    d.items
        .iter()
        .filter_map(|i| {
            let caja = i.caja.as_ref()?;
            let pista = i.track_id.map(|t| format!(" #{t}")).unwrap_or_default();
            let distancia = i
                .distancia_m
                .map(|m| format!(" · {m:.1} m"))
                .unwrap_or_default();
            Some(CajaVivo {
                x: caja.x,
                y: caja.y,
                ancho: caja.ancho,
                alto: caja.alto,
                etiqueta: format!(
                    "{}{pista} {:.0}%{distancia}",
                    i.clase.to_uppercase(),
                    i.confianza * 100.0
                )
                .into(),
                tono: tono_clase(&i.clase),
            })
        })
        .collect()
}

fn tono_clase(clase: &str) -> Color {
    let rgb = |v: u32| Color::from_argb_encoded(0xff00_0000 | v);
    match clase {
        "person" | "persona" => rgb(0xFFBB33),
        "car" | "bus" | "truck" | "motorcycle" | "bicycle" => rgb(0x3FA8FF),
        "dog" | "cat" | "horse" | "cow" | "bird" => rgb(0x9BD66B),
        _ => rgb(0x00D4AA),
    }
}

fn refrescar_unidades(c: &Contexto, m: &Memoria) {
    let mut lista: Vec<(&Uuid, &Unidad)> = m.unidades.iter().collect();
    lista.sort_by_key(|(_, u)| u.numero);
    let filas: Vec<UnidadVivo> = lista
        .iter()
        .map(|(id, u)| UnidadVivo {
            id: id.to_string().into(),
            nombre: format!("Unidad de Campo {}", u.numero).into(),
            detalle: if u.activa() {
                format!("EN LÍNEA · {:.0} FPS", u.fps())
            } else {
                format!("SIN SEÑAL HACE {} S", u.visto.elapsed().as_secs())
            }
            .into(),
            activa: u.activa(),
        })
        .collect();
    let activas = lista.iter().filter(|(_, u)| u.activa()).count() as i32;
    let seleccion = m.seleccion.map(|s| s.to_string()).unwrap_or_default();
    let elegida_activa = m
        .seleccion
        .and_then(|s| m.unidades.get(&s))
        .is_some_and(Unidad::activa);
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_vivo_elegida_activa(elegida_activa);
        e.set_vivo_unidades(ModelRc::new(VecModel::from(filas)));
        e.set_vivo_activas(activas);
        e.set_vivo_seleccion(seleccion.into());
    })
    .ok();
}

fn refrescar_telemetria(c: &Contexto, m: &Memoria) {
    let Some(u) = m.seleccion.and_then(|s| m.unidades.get(&s)) else {
        return;
    };
    let d = u.dispositivo.as_ref();
    let g = u.gps.as_ref();
    let dato = |valor: Option<String>, etiqueta: &str, estado: i32| DatoIndicador {
        valor: valor.clone().unwrap_or_else(|| "—".into()).into(),
        etiqueta: etiqueta.into(),
        estado: if valor.is_some() { estado } else { 3 },
    };
    let bpm = d.and_then(|d| d.bpm);
    let termico = d.and_then(|d| d.termico);
    let cola = d.map(|d| d.cola_pendiente);
    let datos = vec![
        dato(
            bpm.map(|b| b.to_string()),
            "BPM",
            bpm.map_or(0, |b| i32::from(b > 150) + i32::from(b > 175)),
        ),
        dato(
            d.map(|d| match d.red() {
                Red::Wifi => "WI-FI".to_owned(),
                Red::Celular => "MÓVIL".to_owned(),
                Red::SinConexion => "SIN RED".to_owned(),
                Red::Desconocida => "—".to_owned(),
            }),
            "RED",
            d.map_or(0, |d| if d.red() == Red::SinConexion { 2 } else { 0 }),
        ),
        dato(
            termico.map(|t| ["NORMAL", "TIBIO", "ALTO", "CRÍTICO"][t.min(3) as usize].to_owned()),
            "TÉRMICO",
            termico.map_or(0, |t| t.min(2) as i32),
        ),
        dato(
            cola.map(|n| n.to_string()),
            "EN COLA",
            cola.map_or(0, |n| i32::from(n > 0)),
        ),
        dato(
            g.and_then(|g| g.velocidad)
                .map(|v| format!("{:.1}", v * 3.6)),
            "KM/H",
            0,
        ),
        dato(
            g.and_then(|g| g.altitud).map(|a| format!("{a:.0} m")),
            "ALTITUD",
            0,
        ),
        dato(
            d.and_then(|d| d.brujula)
                .or(g.and_then(|g| g.rumbo))
                .map(|r| format!("{r:.0}°")),
            "RUMBO",
            0,
        ),
        dato(
            g.and_then(|g| g.precision_m).map(|p| format!("±{p:.0} m")),
            "PRECISIÓN",
            g.and_then(|g| g.precision_m)
                .map_or(0, |p| i32::from(p > 25.0)),
        ),
    ];
    let bateria = d.and_then(|d| d.bateria).unwrap_or(-1.0);
    let coordenadas = g.map_or("Sin GPS todavía".into(), |g| {
        format!("{:.5}, {:.5}", g.lat, g.lng)
    });
    let mision = g
        .and_then(|g| kepler_proto::bytes_a_uuid(&g.mision_id).ok())
        .map(|id| format!("MISIÓN {}", &id.to_string()[..8]))
        .unwrap_or_default();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_vivo_datos(ModelRc::new(VecModel::from(datos)));
        e.set_vivo_bateria(bateria);
        e.set_vivo_coordenadas(coordenadas.into());
        e.set_vivo_mision(mision.into());
    })
    .ok();
}

/// Posición y recorrido de cada unidad para la capa del mapa.
fn geojson_unidades(m: &Memoria) -> String {
    let mut features = Vec::new();
    for u in m.unidades.values() {
        if u.recorrido.len() > 1 {
            features.push(json!({ "type": "Feature", "properties": {},
                                  "geometry": { "type": "LineString", "coordinates": u.recorrido } }));
        }
        if let Some(p) = u.recorrido.last() {
            features.push(
                json!({ "type": "Feature", "properties": { "activa": u.activa() },
                                  "geometry": { "type": "Point", "coordinates": p } }),
            );
        }
    }
    json!({ "type": "FeatureCollection", "features": features }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use kepler_proto::v1::{Caja, Deteccion};

    fn unidad() -> Unidad {
        Unidad {
            numero: 1,
            visto: Instant::now(),
            gps: None,
            recorrido: vec![[-66.88, 10.5], [-66.879, 10.501]],
            dispositivo: None,
            fotogramas: VecDeque::new(),
            ultimo_fotograma: 7,
            detecciones: None,
        }
    }

    #[test]
    fn cajas_con_pista_y_distancia() {
        let mut u = unidad();
        u.detecciones = Some((
            Detecciones {
                items: vec![Deteccion {
                    clase: "person".into(),
                    confianza: 0.91,
                    caja: Some(Caja {
                        x: 0.1,
                        y: 0.2,
                        ancho: 0.3,
                        alto: 0.4,
                    }),
                    track_id: Some(3),
                    distancia_m: Some(4.25),
                }],
                ..Default::default()
            },
            Instant::now(),
        ));
        let c = cajas(&u);
        assert_eq!(c[0].etiqueta, "PERSON #3 91% · 4.2 m");
        assert!(pie(&u).starts_with("FOTOGRAMA 7"));
    }

    #[test]
    fn mapa_con_recorrido_y_posicion() {
        let mut m = Memoria::default();
        m.unidades.insert(Uuid::nil(), unidad());
        let g: serde_json::Value = serde_json::from_str(&geojson_unidades(&m)).unwrap();
        let tipos: Vec<&str> = g["features"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["geometry"]["type"].as_str().unwrap())
            .collect();
        assert_eq!(tipos, ["LineString", "Point"]);
    }
}
