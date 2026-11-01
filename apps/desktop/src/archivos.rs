//! Archivos: misiones, rejilla de hallazgos con fotos, detalle editable y
//! comparador de identidades. Las ediciones se suben por `/v1/sync/subir` con la
//! fila completa y la versión siguiente (misma regla de conflictos que el iPhone).

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Local, Utc};
use futures_util::StreamExt;
use serde_json::{Value, json};
use slint::{Color, ComponentHandle, Model, ModelRc, SharedString, VecModel};
use tokio::sync::Mutex;

use crate::imagenes::{self, GRANDE, MINIATURA};
use crate::panel::Contexto;
use crate::{Candidato, Detalle, Estado, Hallazgo, MisionArchivo};

const POR_PAGINA: usize = 60;
/// Fotos que se piden a la vez.
const EN_PARALELO: usize = 6;
const COMPARADOR: u32 = 800;

struct Categoria {
    id: String,
    nombre: String,
    subcategorias: Vec<(String, String)>,
}

/// Lo que se calcula fuera del hilo de la UI (los structs de Slint con `image` no son `Send`).
#[derive(Clone)]
struct Ficha {
    id: String,
    nombre: String,
    etiqueta: String,
    tono: Color,
    fecha: String,
}

impl Ficha {
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

#[derive(Clone)]
struct DatosCandidato {
    id: String,
    nombre: String,
    similitud: f32,
    fecha: String,
}

impl DatosCandidato {
    fn en_ui(self) -> Candidato {
        Candidato {
            id: self.id.into(),
            nombre: self.nombre.into(),
            similitud: self.similitud,
            fecha: self.fecha.into(),
            imagen: Default::default(),
            tiene_imagen: false,
        }
    }
}

/// Campos editables del detalle, sin la foto.
pub struct DatosDetalle {
    id: String,
    tipo: String,
    nombre: String,
    texto: String,
    notas: String,
    nivel: String,
    estado: String,
    compartido: bool,
    categoria: i32,
    subcategoria: i32,
    datos: String,
}

impl DatosDetalle {
    pub fn desde_ui(d: &Detalle) -> Self {
        Self {
            id: d.id.to_string(),
            tipo: d.tipo.to_string(),
            nombre: d.nombre.to_string(),
            texto: d.texto.to_string(),
            notas: d.notas.to_string(),
            nivel: d.nivel.to_string(),
            estado: d.estado.to_string(),
            compartido: d.compartido,
            categoria: d.categoria,
            subcategoria: d.subcategoria,
            datos: d.datos.to_string(),
        }
    }

    fn en_ui(self) -> Detalle {
        Detalle {
            id: self.id.into(),
            tipo: self.tipo.into(),
            nombre: self.nombre.into(),
            texto: self.texto.into(),
            notas: self.notas.into(),
            nivel: self.nivel.into(),
            estado: self.estado.into(),
            compartido: self.compartido,
            categoria: self.categoria,
            subcategoria: self.subcategoria,
            datos: self.datos.into(),
            imagen: Default::default(),
            tiene_imagen: false,
        }
    }
}

#[derive(Default)]
pub struct Memoria {
    categorias: Vec<Categoria>,
    /// Filas tal cual llegaron del servidor (para editarlas y subirlas completas).
    filas: HashMap<String, Value>,
    cursor: Option<DateTime<Utc>>,
    pendientes: Vec<Value>,
    /// Cada carga invalida las fotos que aún lleguen de la anterior.
    generacion: u64,
}

pub type Compartida = Mutex<Memoria>;

pub fn preparar(e: &Estado<'_>) {
    e.set_archivos(ModelRc::new(VecModel::<Hallazgo>::default()));
    e.set_comparador_personas(ModelRc::new(VecModel::<Candidato>::default()));
    e.set_comparador_candidatos(ModelRc::new(VecModel::<Candidato>::default()));
}

pub fn olvidar(e: &Estado<'_>) {
    if let Some(v) = e
        .get_archivos()
        .as_any()
        .downcast_ref::<VecModel<Hallazgo>>()
    {
        v.clear();
    }
    reemplazar(&e.get_comparador_personas(), Vec::new());
    reemplazar(&e.get_comparador_candidatos(), Vec::new());
    e.set_archivos_misiones(ModelRc::default());
    e.set_detalle_abierto(false);
    e.set_comparador_abierto(false);
}

/// Al abrir la pestaña: misiones, catálogo, primera página y pendientes del comparador.
pub async fn entrar(c: &Arc<Contexto>, tipo: String, mision: String, busqueda: String) {
    let (misiones, catalogo) = tokio::join!(
        c.cliente.get::<Vec<Value>>("/v1/misiones?limite=200"),
        cargar_catalogo(c),
    );
    let mut filas = vec![
        fila_mision("", "Todas", "", ""),
        fila_mision("ninguna", "Sin misión", "Capturas sueltas", ""),
    ];
    for m in misiones.unwrap_or_default() {
        let fecha = m["creado_en"]
            .as_str()
            .and_then(|f| f.parse::<DateTime<Utc>>().ok())
            .map(|f| {
                f.with_timezone(&Local)
                    .format("%d/%m/%Y · %H:%M")
                    .to_string()
            })
            .unwrap_or_default();
        let zona = m["zona"].as_str().filter(|z| !z.is_empty());
        let detalle = zona.map(|z| format!("{fecha} · {z}")).unwrap_or(fecha);
        let titulo = m["titulo"]
            .as_str()
            .filter(|t| !t.is_empty())
            .or(m["codigo"].as_str())
            .unwrap_or_default();
        filas.push(fila_mision(
            m["id"].as_str().unwrap_or_default(),
            titulo,
            &detalle,
            m["estado"].as_str().unwrap_or_default(),
        ));
    }
    let nombres = catalogo;
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_archivos_misiones(ModelRc::new(VecModel::from(filas)));
        e.set_categorias(modelo_textos(nombres));
    })
    .ok();
    tokio::join!(
        cargar(c, tipo, mision, busqueda, false),
        contar_pendientes(c)
    );
}

fn fila_mision(id: &str, titulo: &str, detalle: &str, estado: &str) -> MisionArchivo {
    MisionArchivo {
        id: id.into(),
        titulo: titulo.into(),
        detalle: detalle.into(),
        estado: estado.into(),
    }
}

/// Carga el catálogo una vez por sesión; devuelve los nombres para el selector.
async fn cargar_catalogo(c: &Arc<Contexto>) -> Vec<String> {
    let mut m = c.archivos.lock().await;
    if m.categorias.is_empty()
        && let Ok(cat) = c.cliente.get::<Value>("/v1/catalogos").await
    {
        let subs = cat["subcategorias"].as_array().cloned().unwrap_or_default();
        m.categorias = cat["categorias"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|k| {
                let id = k["id"].as_str().unwrap_or_default().to_owned();
                Categoria {
                    subcategorias: subs
                        .iter()
                        .filter(|s| s["categoria_id"].as_str() == Some(id.as_str()))
                        .map(|s| {
                            (
                                s["id"].as_str().unwrap_or_default().to_owned(),
                                s["nombre"].as_str().unwrap_or_default().to_owned(),
                            )
                        })
                        .collect(),
                    nombre: k["nombre"].as_str().unwrap_or_default().to_owned(),
                    id,
                }
            })
            .collect();
    }
    std::iter::once("Sin categoría".to_owned())
        .chain(m.categorias.iter().map(|k| k.nombre.clone()))
        .collect()
}

/// Rejilla con los filtros dados; `seguir` añade la página siguiente.
pub async fn cargar(
    c: &Arc<Contexto>,
    tipo: String,
    mision: String,
    busqueda: String,
    seguir: bool,
) {
    c.ui.upgrade_in_event_loop(|ui| ui.global::<Estado>().set_archivos_cargando(true))
        .ok();
    let (cursor, generacion) = {
        let mut m = c.archivos.lock().await;
        if !seguir {
            m.generacion += 1;
            m.filas.clear();
        }
        (if seguir { m.cursor } else { None }, m.generacion)
    };
    let mut ruta = format!("/v1/archivos?tipo={tipo}&limite={POR_PAGINA}");
    if !mision.is_empty() {
        ruta.push_str(&format!("&mision={mision}"));
    }
    if !busqueda.trim().is_empty() {
        ruta.push_str(&format!("&q={}", codificar_url(busqueda.trim())));
    }
    if let Some(antes) = cursor {
        ruta.push_str(&format!("&antes={}", codificar_url(&antes.to_rfc3339())));
    }
    let pagina = c.cliente.get::<Value>(&ruta).await;
    let Ok(pagina) = pagina else {
        c.ui.upgrade_in_event_loop(|ui| ui.global::<Estado>().set_archivos_cargando(false))
            .ok();
        return;
    };
    let items = pagina["items"].as_array().cloned().unwrap_or_default();
    let hay_mas = pagina["hay_mas"].as_bool().unwrap_or(false);
    let (fichas, fotos) = {
        let mut m = c.archivos.lock().await;
        m.cursor = items
            .last()
            .and_then(|f| f["capturado_en"].as_str())
            .and_then(|f| f.parse().ok());
        let fichas: Vec<Ficha> = items.iter().map(|f| ficha(&m, &tipo, f)).collect();
        let fotos: Vec<(String, String)> = items
            .iter()
            .filter_map(|f| Some((texto(f, "id"), f["imagen_path"].as_str()?.to_owned())))
            .collect();
        for f in items {
            m.filas.insert(texto(&f, "id"), f);
        }
        (fichas, fotos)
    };
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        let modelo = e.get_archivos();
        if let Some(v) = modelo.as_any().downcast_ref::<VecModel<Hallazgo>>() {
            if !seguir {
                v.clear();
            }
            v.extend(fichas.into_iter().map(Ficha::en_ui));
        }
        e.set_archivos_hay_mas(hay_mas);
        e.set_archivos_cargando(false);
    })
    .ok();

    // Fotos en paralelo; cada una se coloca en su ficha al llegar
    futures_util::stream::iter(fotos)
        .for_each_concurrent(EN_PARALELO, |(id, ruta)| {
            let c = c.clone();
            async move {
                let Some(pixeles) = c.imagenes.obtener(&c.cliente, &ruta, MINIATURA).await else {
                    return;
                };
                if c.archivos.lock().await.generacion != generacion {
                    return;
                }
                c.ui.upgrade_in_event_loop(move |ui| {
                    let modelo = ui.global::<Estado>().get_archivos();
                    if let Some(i) = modelo.iter().position(|h| h.id == id.as_str())
                        && let Some(mut h) = modelo.row_data(i)
                    {
                        h.imagen = imagenes::a_imagen(pixeles);
                        h.tiene_imagen = true;
                        modelo.set_row_data(i, h);
                    }
                })
                .ok();
            }
        })
        .await;
}

fn ficha(m: &Memoria, tipo: &str, f: &Value) -> Ficha {
    let (etiqueta, tono) = etiqueta(m, tipo, f);
    Ficha {
        id: texto(f, "id"),
        nombre: texto(f, "nombre"),
        etiqueta,
        tono,
        fecha: fecha(f),
    }
}

fn etiqueta(m: &Memoria, tipo: &str, f: &Value) -> (String, Color) {
    let rgb = |c: u32| Color::from_argb_encoded(0xff00_0000 | c);
    let compartido = f["visibilidad"] == "compartido";
    match tipo {
        "personas" => {
            let h = f["hostilidad"].as_str().unwrap_or("desconocido");
            let tono = match h {
                "hostil" => rgb(0xFF4444),
                "aliado" => rgb(0x00D4AA),
                "neutral" => rgb(0x3FA8FF),
                _ => rgb(0x999999),
            };
            let vinculada = if f["identidad_id"].is_null() {
                ""
            } else {
                " · VINCULADA"
            };
            (format!("{}{vinculada}", h.to_uppercase()), tono)
        }
        "puntos_interes" => {
            let n = f["nivel_riesgo"].as_str().unwrap_or("medio");
            let tono = match n {
                "critico" => rgb(0xFF4444),
                "alto" => rgb(0xFF8844),
                "medio" => rgb(0xFFBB33),
                _ => rgb(0x00D4AA),
            };
            let inactivo = if f["estado"] == "inactivo" {
                " · INACTIVO"
            } else {
                ""
            };
            let nivel = if n == "critico" {
                "CRÍTICO".to_owned()
            } else {
                n.to_uppercase()
            };
            (format!("RIESGO {nivel}{inactivo}"), tono)
        }
        _ => {
            let nombre = f["categoria_id"]
                .as_str()
                .and_then(|id| m.categorias.iter().find(|k| k.id == id))
                .map(|k| k.nombre.to_uppercase());
            let extra = if compartido { " · COMPARTIDO" } else { "" };
            match nombre {
                Some(n) => (format!("{n}{extra}"), rgb(0x3FA8FF)),
                None => (format!("SIN CATEGORIZAR{extra}"), rgb(0xFFBB33)),
            }
        }
    }
}

pub async fn abrir_detalle(c: &Arc<Contexto>, id: String, tipo: String) {
    let (detalle, subcategorias, foto) = {
        let m = c.archivos.lock().await;
        let Some(f) = m.filas.get(&id) else { return };
        let categoria = f["categoria_id"]
            .as_str()
            .and_then(|cid| m.categorias.iter().position(|k| k.id == cid));
        let subs = categoria
            .map(|i| &m.categorias[i].subcategorias)
            .cloned()
            .unwrap_or_default();
        let subcategoria = f["subcategoria_id"]
            .as_str()
            .and_then(|sid| subs.iter().position(|(s, _)| s == sid))
            .map_or(0, |i| i + 1);
        let detalle = DatosDetalle {
            id: id.clone(),
            tipo: tipo.clone(),
            nombre: texto(f, "nombre"),
            texto: texto(
                f,
                if tipo == "personas" {
                    "rasgos_fisicos"
                } else {
                    "descripcion"
                },
            ),
            notas: texto(f, "notas"),
            nivel: texto(
                f,
                if tipo == "personas" {
                    "hostilidad"
                } else {
                    "nivel_riesgo"
                },
            ),
            estado: texto(f, "estado"),
            compartido: f["visibilidad"] == "compartido",
            categoria: categoria.map_or(0, |i| i as i32 + 1),
            subcategoria: subcategoria as i32,
            datos: datos(f),
        };
        (detalle, subs, f["imagen_path"].as_str().map(str::to_owned))
    };
    let nombres = subcategorias.into_iter().map(|(_, n)| n).collect();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_subcategorias(modelo_textos_con_vacio(nombres));
        e.set_detalle(detalle.en_ui());
        e.set_detalle_error("".into());
        e.set_detalle_guardando(false);
        e.set_detalle_abierto(true);
    })
    .ok();
    if let Some(ruta) = foto
        && let Some(p) = c.imagenes.obtener(&c.cliente, &ruta, GRANDE).await
    {
        c.ui.upgrade_in_event_loop(move |ui| {
            let e = ui.global::<Estado>();
            let mut d = e.get_detalle();
            if d.id == id.as_str() {
                d.imagen = imagenes::a_imagen(p);
                d.tiene_imagen = true;
                e.set_detalle(d);
            }
        })
        .ok();
    }
}

/// Línea informativa bajo la foto del detalle.
fn datos(f: &Value) -> String {
    let mut partes = vec![format!("Capturado {}", fecha(f))];
    if let (Some(lat), Some(lng)) = (f["lat"].as_f64(), f["lng"].as_f64()) {
        partes.push(format!("{lat:.5}, {lng:.5}"));
    }
    if let Some(clase) = f["clase_yolo"].as_str() {
        let confianza = f["confianza"]
            .as_f64()
            .map(|c| format!(" {:.0} %", c * 100.0))
            .unwrap_or_default();
        partes.push(format!("YOLO «{clase}»{confianza}"));
    }
    if f["tiene_embedding"] == false {
        partes.push("sin huella visual (Re-ID)".into());
    }
    partes.join(" · ")
}

pub async fn elegir_categoria(c: &Arc<Contexto>, indice: i32) {
    let nombres: Vec<String> = {
        let m = c.archivos.lock().await;
        usize::try_from(indice - 1)
            .ok()
            .and_then(|i| m.categorias.get(i))
            .map(|k| k.subcategorias.iter().map(|(_, n)| n.clone()).collect())
            .unwrap_or_default()
    };
    c.ui.upgrade_in_event_loop(move |ui| {
        ui.global::<Estado>()
            .set_subcategorias(modelo_textos_con_vacio(nombres));
    })
    .ok();
}

pub async fn guardar(c: &Arc<Contexto>, d: DatosDetalle) {
    let id = d.id.clone();
    let tipo = d.tipo.clone();
    let fila = {
        let m = c.archivos.lock().await;
        let Some(original) = m.filas.get(&id) else {
            return;
        };
        let mut f = original.clone();
        let opcional = |s: &str| {
            let t = s.trim();
            if t.is_empty() {
                Value::Null
            } else {
                Value::String(t.to_owned())
            }
        };
        f["nombre"] = json!(d.nombre.trim());
        match tipo.as_str() {
            "personas" => {
                f["rasgos_fisicos"] = opcional(&d.texto);
                f["notas"] = opcional(&d.notas);
                f["hostilidad"] = json!(d.nivel.as_str());
            }
            "puntos_interes" => {
                f["descripcion"] = opcional(&d.texto);
                f["nivel_riesgo"] = json!(d.nivel.as_str());
                f["estado"] = json!(d.estado.as_str());
                f["visibilidad"] = json!(if d.compartido {
                    "compartido"
                } else {
                    "privado"
                });
            }
            _ => {
                f["descripcion"] = opcional(&d.texto);
                f["visibilidad"] = json!(if d.compartido {
                    "compartido"
                } else {
                    "privado"
                });
                let categoria = usize::try_from(d.categoria - 1)
                    .ok()
                    .and_then(|i| m.categorias.get(i));
                f["categoria_id"] = categoria.map_or(Value::Null, |k| json!(k.id));
                f["subcategoria_id"] = categoria
                    .and_then(|k| {
                        usize::try_from(d.subcategoria - 1)
                            .ok()
                            .and_then(|i| k.subcategorias.get(i))
                    })
                    .map_or(Value::Null, |(s, _)| json!(s));
            }
        }
        f
    };
    subir(c, &tipo, &id, fila).await;
}

pub async fn eliminar(c: &Arc<Contexto>, id: String, tipo: String) {
    let fila = {
        let m = c.archivos.lock().await;
        let Some(original) = m.filas.get(&id) else {
            return;
        };
        let mut f = original.clone();
        f["eliminado_en"] = json!(Utc::now());
        f
    };
    subir(c, &tipo, &id, fila).await;
}

/// Sube la fila con la versión siguiente y refleja el resultado en la rejilla.
async fn subir(c: &Arc<Contexto>, tipo: &str, id: &str, mut fila: Value) {
    c.ui.upgrade_in_event_loop(|ui| ui.global::<Estado>().set_detalle_guardando(true))
        .ok();
    fila["version"] = json!(fila["version"].as_i64().unwrap_or(1) + 1);
    fila["actualizado_en"] = json!(Utc::now());
    if let Some(o) = fila.as_object_mut() {
        o.remove("tiene_embedding");
    }
    let r = c
        .cliente
        .post::<Value>(
            "/v1/sync/subir",
            &Value::Object([(tipo.to_owned(), json!([fila]))].into_iter().collect()),
        )
        .await;
    let resultado = match r {
        Err(e) => Err(e.to_string()),
        Ok(r) => {
            if let Some(motivo) = r["rechazados"][0]["motivo"].as_str() {
                Err(format!("Rechazado: {motivo}"))
            } else if r["conflictos"][0]["ganador"] == "servidor" {
                Err(
                    "Otro dispositivo lo cambió antes: recarga los archivos y vuelve a intentarlo"
                        .into(),
                )
            } else {
                r["aplicados"][tipo][0]
                    .as_object()
                    .cloned()
                    .map(Value::Object)
                    .ok_or_else(|| "respuesta inesperada del servidor".to_owned())
            }
        }
    };
    let Ok(final_) = resultado else {
        let error = resultado.err().unwrap_or_default();
        c.ui.upgrade_in_event_loop(move |ui| {
            let e = ui.global::<Estado>();
            e.set_detalle_guardando(false);
            e.set_detalle_error(error.into());
        })
        .ok();
        return;
    };
    let borrado = !final_["eliminado_en"].is_null();
    let nueva = {
        let mut m = c.archivos.lock().await;
        let mut f = final_.clone();
        if let (Some(o), Some(anterior)) = (f.as_object_mut(), m.filas.get(id)) {
            o.remove("embedding");
            o.insert(
                "tiene_embedding".into(),
                anterior["tiene_embedding"].clone(),
            );
        }
        let nueva = ficha(&m, tipo, &f);
        if borrado {
            m.filas.remove(id);
        } else {
            m.filas.insert(id.to_owned(), f);
        }
        nueva
    };
    let id = id.to_owned();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_detalle_guardando(false);
        e.set_detalle_abierto(false);
        let modelo = e.get_archivos();
        let Some(v) = modelo.as_any().downcast_ref::<VecModel<Hallazgo>>() else {
            return;
        };
        if let Some(i) = v.iter().position(|h| h.id == id.as_str()) {
            if borrado {
                v.remove(i);
            } else if let Some(anterior) = v.row_data(i) {
                v.set_row_data(
                    i,
                    Hallazgo {
                        imagen: anterior.imagen,
                        tiene_imagen: anterior.tiene_imagen,
                        ..nueva.en_ui()
                    },
                );
            }
        }
    })
    .ok();
}

// --- Comparador ---------------------------------------------------------------

pub async fn contar_pendientes(c: &Arc<Contexto>) {
    if let Ok(p) = c
        .cliente
        .get::<Vec<Value>>("/v1/identidades/pendientes")
        .await
    {
        let n = p.len() as i32;
        c.ui.upgrade_in_event_loop(move |ui| ui.global::<Estado>().set_pendientes_identidad(n))
            .ok();
    }
}

/// Carga las personas por identificar y muestra la `indice`.
pub async fn abrir_comparador(c: &Arc<Contexto>, indice: usize) {
    c.ui.upgrade_in_event_loop(|ui| {
        let e = ui.global::<Estado>();
        e.set_comparador_cargando(true);
        e.set_comparador_abierto(true);
    })
    .ok();
    let pendientes = c
        .cliente
        .get::<Vec<Value>>("/v1/identidades/pendientes")
        .await
        .unwrap_or_default();
    let personas: Vec<DatosCandidato> = pendientes.iter().map(candidato).collect();
    let fotos: Vec<(String, String)> = pendientes
        .iter()
        .filter_map(|p| Some((texto(p, "id"), p["imagen_path"].as_str()?.to_owned())))
        .collect();
    let n = pendientes.len();
    c.archivos.lock().await.pendientes = pendientes;
    let indice = indice.min(n.saturating_sub(1));
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_pendientes_identidad(n as i32);
        reemplazar(
            &e.get_comparador_personas(),
            personas.into_iter().map(DatosCandidato::en_ui).collect(),
        );
        e.set_comparador_cargando(false);
    })
    .ok();
    elegir_persona(c, indice).await;
    cargar_fotos(c, fotos, MINIATURA, |e| e.get_comparador_personas()).await;
}

pub async fn elegir_persona(c: &Arc<Contexto>, indice: usize) {
    let (persona, candidatos) = {
        let m = c.archivos.lock().await;
        let Some(p) = m.pendientes.get(indice) else {
            return;
        };
        (
            p.clone(),
            p["candidatos"].as_array().cloned().unwrap_or_default(),
        )
    };
    let filas: Vec<DatosCandidato> = candidatos.iter().map(candidato).collect();
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_comparador_persona(indice as i32);
        e.set_comparador_candidato(0);
        reemplazar(
            &e.get_comparador_candidatos(),
            filas.into_iter().map(DatosCandidato::en_ui).collect(),
        );
    })
    .ok();
    // La persona elegida también en grande
    if let Some(ruta) = persona["imagen_path"].as_str() {
        let id = texto(&persona, "id");
        cargar_fotos(c, vec![(id, ruta.to_owned())], COMPARADOR, |e| {
            e.get_comparador_personas()
        })
        .await;
    }
    let fotos = candidatos
        .iter()
        .filter_map(|p| Some((texto(p, "id"), p["imagen_path"].as_str()?.to_owned())))
        .collect();
    cargar_fotos(c, fotos, COMPARADOR, |e| e.get_comparador_candidatos()).await;
}

pub async fn vincular(c: &Arc<Contexto>, persona: String, con: String) {
    let r = c
        .cliente
        .post::<Value>(
            &format!("/v1/personas/{persona}/vincular"),
            &json!({ "con": con }),
        )
        .await;
    if r.is_ok() {
        let indice = c
            .archivos
            .lock()
            .await
            .pendientes
            .iter()
            .position(|p| p["id"].as_str() == Some(persona.as_str()))
            .unwrap_or(0);
        abrir_comparador(c, indice).await;
    }
}

fn candidato(p: &Value) -> DatosCandidato {
    DatosCandidato {
        id: texto(p, "id"),
        nombre: texto(p, "nombre"),
        similitud: p["similitud"].as_f64().unwrap_or(0.0) as f32,
        fecha: fecha(p),
    }
}

async fn cargar_fotos(
    c: &Arc<Contexto>,
    fotos: Vec<(String, String)>,
    lado: u32,
    modelo: fn(&Estado<'_>) -> ModelRc<Candidato>,
) {
    futures_util::stream::iter(fotos)
        .for_each_concurrent(EN_PARALELO, |(id, ruta)| {
            let c = c.clone();
            async move {
                let Some(p) = c.imagenes.obtener(&c.cliente, &ruta, lado).await else {
                    return;
                };
                c.ui.upgrade_in_event_loop(move |ui| {
                    let m = modelo(&ui.global::<Estado>());
                    if let Some(i) = m.iter().position(|x| x.id == id.as_str())
                        && let Some(mut x) = m.row_data(i)
                    {
                        x.imagen = imagenes::a_imagen(p);
                        x.tiene_imagen = true;
                        m.set_row_data(i, x);
                    }
                })
                .ok();
            }
        })
        .await;
}

fn reemplazar(m: &ModelRc<Candidato>, filas: Vec<Candidato>) {
    if let Some(v) = m.as_any().downcast_ref::<VecModel<Candidato>>() {
        v.set_vec(filas);
    }
}

// --- utilidades ---------------------------------------------------------------

fn texto(f: &Value, campo: &str) -> String {
    f[campo].as_str().unwrap_or_default().to_owned()
}

fn fecha(f: &Value) -> String {
    f["capturado_en"]
        .as_str()
        .and_then(|s| s.parse::<DateTime<Utc>>().ok())
        .map(|d| {
            d.with_timezone(&Local)
                .format("%d/%m/%Y · %H:%M")
                .to_string()
        })
        .unwrap_or_default()
}

fn modelo_textos(v: Vec<String>) -> ModelRc<SharedString> {
    ModelRc::new(VecModel::from(
        v.into_iter().map(SharedString::from).collect::<Vec<_>>(),
    ))
}

fn modelo_textos_con_vacio(v: Vec<String>) -> ModelRc<SharedString> {
    modelo_textos(std::iter::once("—".to_owned()).chain(v).collect())
}

/// Codificación de un valor de query string (RFC 3986, sin dependencias).
fn codificar_url(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codifica_la_busqueda() {
        assert_eq!(codificar_url("autobús 2"), "autob%C3%BAs%202");
        assert_eq!(
            codificar_url("2026-11-01T05:00:00+00:00"),
            "2026-11-01T05%3A00%3A00%2B00%3A00"
        );
    }

    #[test]
    fn etiquetas_por_tipo() {
        let m = Memoria::default();
        let (t, _) = etiqueta(
            &m,
            "personas",
            &json!({ "hostilidad": "hostil", "identidad_id": "x" }),
        );
        assert_eq!(t, "HOSTIL · VINCULADA");
        let (t, _) = etiqueta(&m, "puntos_interes", &json!({ "nivel_riesgo": "critico" }));
        assert_eq!(t, "RIESGO CRÍTICO");
        let (t, _) = etiqueta(&m, "objetos", &json!({ "visibilidad": "compartido" }));
        assert_eq!(t, "SIN CATEGORIZAR · COMPARTIDO");
    }
}
