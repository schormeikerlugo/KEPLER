//! Tarjetas del dashboard: radar y frecuentes de objetos, POIs por categoría
//! (con drill-down), personas y rutas recientes, consejo del día.

use std::f64::consts::PI;
use std::sync::Arc;

use chrono::{DateTime, Local, Utc};
use serde_json::Value;
use slint::{Color, ComponentHandle, Model, ModelRc, VecModel};

use kepler_core::consejos::{self, Situacion};
use kepler_core::entorno::CategoriaClima;

use crate::imagenes::{self, MINIATURA};
use crate::modelos::{Dashboard, Explorador};
use crate::panel::Contexto;
use crate::{
    CategoriaPoi, Estado, EtiquetaRadar, FilaObjeto, FilaRuta, Hallazgo, Pantalla, archivos,
};

/// Ejes mínimos del radar (con menos categorías no se ve un polígono).
const EJES_MIN: usize = 5;
const EJES_MAX: usize = 8;

/// Persona o POI listado en una tarjeta (sin foto: la foto no es `Send`).
#[derive(Clone)]
struct Item {
    id: String,
    nombre: String,
    etiqueta: String,
    tono: Color,
    fecha: String,
    imagen_path: Option<String>,
}

impl Item {
    fn en_ui(self) -> Hallazgo {
        Hallazgo {
            id: self.id.into(),
            nombre: self.nombre.into(),
            etiqueta: self.etiqueta.into(),
            tono: self.tono,
            fecha: self.fecha.into(),
            imagen: Default::default(),
            tiene_imagen: false,
        }
    }
}

/// Todo lo calculado fuera del hilo de la UI.
pub struct Datos {
    frecuentes: Vec<FilaObjeto>,
    radar: (String, String, String, Vec<EtiquetaRadar>),
    categorias: Vec<CategoriaPoi>,
    personas: Vec<Item>,
    rutas: Vec<FilaRuta>,
    /// Filas completas para abrir el detalle sin pedirlas otra vez.
    filas_personas: Vec<Value>,
}

pub fn construir(d: &Dashboard) -> Datos {
    let frecuentes = d
        .objetos_frecuentes
        .iter()
        .map(|o| FilaObjeto {
            id: texto(o, "ultimo_id").into(),
            nombre: texto(o, "nombre").into(),
            categoria: texto(o, "categoria").into(),
            total: o["total"].as_i64().unwrap_or(0) as i32,
            tono: color_hex(o["color"].as_str()),
        })
        .collect();
    let por_categoria: Vec<(String, f64)> = d
        .objetos_por_categoria
        .iter()
        .take(EJES_MAX)
        .map(|c| (texto(c, "nombre"), c["total"].as_f64().unwrap_or(0.0)))
        .collect();
    let categorias = d
        .pois_por_categoria
        .iter()
        .map(|k| CategoriaPoi {
            id: texto(k, "categoria_id").into(),
            nombre: texto(k, "nombre").into(),
            tono: color_hex(k["color"].as_str()),
            propios: k["propios"].as_i64().unwrap_or(0) as i32,
            compartidos: k["compartidos"].as_i64().unwrap_or(0) as i32,
        })
        .collect();
    let personas = d.recientes.personas.iter().map(persona).collect();
    let rutas = d.recientes.rutas.iter().map(ruta).collect();
    Datos {
        frecuentes,
        radar: radar(&por_categoria),
        categorias,
        personas,
        rutas,
        filas_personas: d.recientes.personas.clone(),
    }
}

pub fn aplicar(c: &Arc<Contexto>, datos: Datos, e: &Estado<'_>) {
    let (poligono, rejilla, ejes, etiquetas) = datos.radar;
    e.set_objetos_frecuentes(ModelRc::new(VecModel::from(datos.frecuentes)));
    e.set_radar_poligono(poligono.into());
    e.set_radar_rejilla(rejilla.into());
    e.set_radar_ejes(ejes.into());
    e.set_radar_etiquetas(ModelRc::new(VecModel::from(etiquetas)));
    e.set_poi_categorias(ModelRc::new(VecModel::from(datos.categorias)));
    e.set_rutas_recientes(ModelRc::new(VecModel::from(datos.rutas)));
    let fotos: Vec<(String, String)> = datos
        .personas
        .iter()
        .filter_map(|p| Some((p.id.clone(), p.imagen_path.clone()?)))
        .collect();
    e.set_personas_recientes(ModelRc::new(VecModel::from(
        datos
            .personas
            .into_iter()
            .map(Item::en_ui)
            .collect::<Vec<_>>(),
    )));
    let c2 = c.clone();
    let filas = datos.filas_personas;
    c.rt.spawn(async move {
        archivos::registrar(&c2, filas).await;
        cargar_fotos(&c2, fotos, |e| e.get_personas_recientes()).await;
    });
}

/// Consejo del día (uno por sesión), con la regla compartida de `kepler-core`.
pub fn consejo(
    d: Option<&Dashboard>,
    e: Option<&Explorador>,
    clima: Option<CategoriaClima>,
) -> String {
    let s = Situacion {
        desgaste_calzado: e.map(|e| e.desgaste_calzado),
        resistencia: e.map(|e| e.resistencia),
        clima,
        pois_riesgo_alto: d.map_or(0, |d| d.alertas.pois_riesgo_alto.max(0) as u64),
        misiones_sin_reporte: d.map_or(0, |d| d.alertas.misiones_sin_reporte.max(0) as u64),
    };
    consejos::consejo(&s, Utc::now().timestamp_subsec_nanos() as usize)
}

// --- POIs por categoría -------------------------------------------------------

pub fn abrir_categoria_poi(c: &Arc<Contexto>, id: String, nombre: String) {
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_poi_categoria(id.as_str().into());
        e.set_poi_categoria_nombre(nombre.into());
        e.set_poi_lista(ModelRc::default());
        e.set_poi_cargando(true);
    }
    let c2 = c.clone();
    c.rt.spawn(async move {
        let ruta = format!("/v1/archivos?tipo=puntos_interes&categoria={id}&limite=50");
        let filas = c2
            .cliente
            .get::<Value>(&ruta)
            .await
            .ok()
            .and_then(|v| v["items"].as_array().cloned())
            .unwrap_or_default();
        let items: Vec<Item> = filas.iter().map(poi).collect();
        archivos::registrar(&c2, filas).await;
        c2.ui
            .upgrade_in_event_loop(move |ui| {
                let e = ui.global::<Estado>();
                if e.get_poi_categoria() == id.as_str() {
                    e.set_poi_lista(ModelRc::new(VecModel::from(
                        items.into_iter().map(Item::en_ui).collect::<Vec<_>>(),
                    )));
                    e.set_poi_cargando(false);
                }
            })
            .ok();
    });
}

/// Abre el detalle editable de un hallazgo desde el dashboard.
pub fn abrir_hallazgo(c: &Arc<Contexto>, tipo: String, id: String) {
    let c2 = c.clone();
    c.rt.spawn(async move { archivos::abrir_por_id(&c2, tipo, id).await });
}

/// «Ver todo»: a Archivos con ese tipo, o al mapa.
pub fn ver_todo(c: &Arc<Contexto>, tipo: &str, ir: impl Fn(Pantalla)) {
    if tipo == "mapa" {
        ir(Pantalla::Mapa);
        return;
    }
    if let Some(ui) = c.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_archivos_tipo(tipo.into());
        e.set_archivos_mision("".into());
        e.set_archivos_busqueda("".into());
    }
    ir(Pantalla::Archivos);
}

// --- utilidades ---------------------------------------------------------------

fn persona(p: &Value) -> Item {
    let h = p["hostilidad"].as_str().unwrap_or("desconocido");
    let tono = match h {
        "hostil" => 0xFF4444,
        "aliado" => 0x00D4AA,
        "neutral" => 0x3FA8FF,
        _ => 0x999999,
    };
    Item {
        id: texto(p, "id"),
        nombre: texto(p, "nombre"),
        etiqueta: h.to_uppercase(),
        tono: rgb(tono),
        fecha: fecha(p),
        imagen_path: p["imagen_path"].as_str().map(str::to_owned),
    }
}

fn poi(p: &Value) -> Item {
    let n = p["nivel_riesgo"].as_str().unwrap_or("medio");
    let tono = match n {
        "critico" => 0xFF4444,
        "alto" => 0xFF8844,
        "medio" => 0xFFBB33,
        _ => 0x00D4AA,
    };
    let nivel = if n == "critico" {
        "CRÍTICO".to_owned()
    } else {
        n.to_uppercase()
    };
    Item {
        id: texto(p, "id"),
        nombre: texto(p, "nombre"),
        etiqueta: format!("RIESGO {nivel}"),
        tono: rgb(tono),
        fecha: fecha(p),
        imagen_path: None,
    }
}

fn ruta(r: &Value) -> FilaRuta {
    let s = r["seguridad"].as_str().unwrap_or("desconocido");
    let tono = match s {
        "seguro" => 0x00D4AA,
        "precaucion" => 0xFFBB33,
        "peligro" => 0xFF4444,
        _ => 0x999999,
    };
    let km = r["distancia_km"]
        .as_f64()
        .map(|k| format!("{k:.1} km"))
        .unwrap_or_else(|| "— km".into());
    let origen = if r["origen"] == "registrada" {
        "registrada en campo"
    } else {
        "planificada"
    };
    FilaRuta {
        nombre: texto(r, "nombre").into(),
        detalle: format!("{km} · {origen}").into(),
        seguridad: if s == "precaucion" { "precaución" } else { s }.into(),
        tono: rgb(tono),
    }
}

/// Polígono, rejilla (4 anillos), ejes y etiquetas en un viewbox de 200×200.
fn radar(valores: &[(String, f64)]) -> (String, String, String, Vec<EtiquetaRadar>) {
    if valores.is_empty() {
        return Default::default();
    }
    let mut ejes: Vec<(String, f64)> = valores.to_vec();
    while ejes.len() < EJES_MIN {
        ejes.push((String::new(), 0.0));
    }
    let n = ejes.len();
    let maximo = ejes.iter().map(|e| e.1).fold(0.0, f64::max).max(1.0);
    let (cx, cy, r) = (100.0, 100.0, 74.0);
    let punto = |i: usize, f: f64| {
        let ang = -PI / 2.0 + 2.0 * PI * i as f64 / n as f64;
        (cx + ang.cos() * r * f, cy + ang.sin() * r * f)
    };
    let poligono_de = |f: &dyn Fn(usize) -> f64| {
        let mut s = String::new();
        for i in 0..n {
            let (x, y) = punto(i, f(i));
            s.push_str(&format!(
                "{} {x:.1} {y:.1} ",
                if i == 0 { "M" } else { "L" }
            ));
        }
        s.push('Z');
        s
    };
    let rejilla = (1..=4)
        .map(|k| poligono_de(&|_| f64::from(k) / 4.0))
        .collect::<Vec<_>>()
        .join(" ");
    let ejes_path = (0..n)
        .map(|i| {
            let (x, y) = punto(i, 1.0);
            format!("M {cx} {cy} L {x:.1} {y:.1}")
        })
        .collect::<Vec<_>>()
        .join(" ");
    // Un mínimo para que una categoría con pocos objetos se vea
    let poligono = poligono_de(&|i| {
        if ejes[i].1 > 0.0 {
            (ejes[i].1 / maximo).max(0.08)
        } else {
            0.0
        }
    });
    let etiquetas = ejes
        .iter()
        .enumerate()
        .filter(|(_, (nombre, _))| !nombre.is_empty())
        .map(|(i, (nombre, _))| {
            let (x, y) = punto(i, 1.22);
            EtiquetaRadar {
                texto: nombre.as_str().into(),
                x: (x / 200.0) as f32,
                y: (y / 200.0) as f32,
            }
        })
        .collect();
    (poligono, rejilla, ejes_path, etiquetas)
}

async fn cargar_fotos(
    c: &Arc<Contexto>,
    fotos: Vec<(String, String)>,
    modelo: fn(&Estado<'_>) -> ModelRc<Hallazgo>,
) {
    for (id, ruta) in fotos {
        let Some(px) = c.imagenes.obtener(&c.cliente, &ruta, MINIATURA).await else {
            continue;
        };
        c.ui.upgrade_in_event_loop(move |ui| {
            let m = modelo(&ui.global::<Estado>());
            if let Some(i) = m.iter().position(|h| h.id == id.as_str())
                && let Some(mut h) = m.row_data(i)
            {
                h.imagen = imagenes::a_imagen(px);
                h.tiene_imagen = true;
                m.set_row_data(i, h);
            }
        })
        .ok();
    }
}

fn texto(v: &Value, campo: &str) -> String {
    v[campo].as_str().unwrap_or_default().to_owned()
}

fn fecha(v: &Value) -> String {
    v["capturado_en"]
        .as_str()
        .and_then(|s| s.parse::<DateTime<Utc>>().ok())
        .map(|d| {
            d.with_timezone(&Local)
                .format("%d/%m/%Y · %H:%M")
                .to_string()
        })
        .unwrap_or_default()
}

fn rgb(v: u32) -> Color {
    Color::from_argb_encoded(0xff00_0000 | v)
}

/// `#RRGGBB` → color (gris si no se entiende).
fn color_hex(s: Option<&str>) -> Color {
    s.and_then(|s| s.strip_prefix('#'))
        .and_then(|h| u32::from_str_radix(h, 16).ok())
        .map_or(rgb(0x888888), rgb)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn radar_rellena_hasta_cinco_ejes() {
        let (poligono, rejilla, ejes, etiquetas) =
            radar(&[("Vehículos".into(), 3.0), ("Animales".into(), 1.0)]);
        assert_eq!(poligono.matches('L').count(), 4, "5 vértices");
        assert_eq!(rejilla.matches('Z').count(), 4, "4 anillos");
        assert_eq!(ejes.matches('M').count(), 5);
        assert_eq!(etiquetas.len(), 2, "los ejes de relleno no llevan nombre");
        // El mayor llega al borde: arriba del centro, a r = 74
        assert!(poligono.starts_with("M 100.0 26.0"), "{poligono}");
    }

    #[test]
    fn colores_hex() {
        assert_eq!(color_hex(Some("#3FA8FF")), rgb(0x3FA8FF));
        assert_eq!(color_hex(Some("rojo")), rgb(0x888888));
    }

    #[test]
    fn consejo_de_contexto_si_hay_algo_que_decir() {
        let e = Explorador {
            desgaste_calzado: 85.0,
            resistencia: 90.0,
            misiones_completadas: 0,
            distancia_total_km: 0.0,
            clima: None,
        };
        assert!(consejo(None, Some(&e), None).contains("calzado"));
        assert!(!consejo(None, None, None).is_empty());
    }
}
