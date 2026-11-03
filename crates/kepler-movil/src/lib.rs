//! Núcleo de la Unidad de Campo. SwiftUI solo pinta: la sesión, la red y (en
//! próximas fases) la cola offline y la sincronización viven aquí, en Rust,
//! para compartirlos con Android en el futuro.
//!
//! Swift recibe `Nucleo` (objeto con métodos `async`), registros y errores
//! generados por UniFFI (`apps/ios/Kepler/Nucleo/kepler_movil.swift`).

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use kepler_cliente::{Cliente, Error as ErrorCliente};
use serde_json::Value;

mod almacen;
mod archivo;
mod biometria;
mod campo;
mod captura;
mod centinela;
mod cortex;
mod mapa;
mod panel;
mod reloj;
mod rendimiento;
mod seguimiento;
mod vision;

pub use archivo::{
    Candidato, EdicionHallazgo, EntradaBitacora, Hallazgo, IdentidadPendiente, PaginaBitacora,
    PaginaHallazgos, TipoHallazgo,
};
pub use biometria::{MuestraBio, ResumenBio};
pub use campo::{EstadoSync, MisionEnCurso, PuntoGps};
pub use captura::{CapturaGuardada, NuevaCaptura, TipoCaptura};
pub use centinela::{Centinela, ModoCentinela};
pub use cortex::{ChatResumen, FinCortex, ImagenCortex, MensajeCortex, OyenteCortex};
pub use mapa::{ProgresoDescarga, RegionMapa};
pub use reloj::{RelojCarbinox, RelojCuenta, ReporteReloj};
pub use rendimiento::{
    DiaSalud, EstadoFisico, FactorPreparacion, PerfilFisicoMovil, RendimientoMision,
};
pub use seguimiento::{Rastreada, Seguidor};
pub use vision::Deteccion;

pub use panel::{
    Atencion, CategoriaConteo, DiaSemana, HallazgoFila, Indicador, MisionFila, Nivel, ObjetoFila,
    Panel, RutaFila,
};

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum ErrorKepler {
    #[error("{mensaje}")]
    Red { mensaje: String },
    #[error("{mensaje}")]
    NoAutorizado { mensaje: String },
    #[error("{mensaje}")]
    Servidor { mensaje: String },
}

impl From<ErrorCliente> for ErrorKepler {
    fn from(e: ErrorCliente) -> Self {
        let mensaje = e.to_string();
        match e {
            ErrorCliente::Red(_) => Self::Red { mensaje },
            ErrorCliente::NoAutorizado(_) => Self::NoAutorizado { mensaje },
            ErrorCliente::Servidor(_) => Self::Servidor { mensaje },
        }
    }
}

/// Implementado en Swift: guarda la sesión en el Llavero (protegida con Face ID).
#[uniffi::export(with_foreign)]
pub trait Llavero: Send + Sync {
    fn guardar_sesion(&self, usuario: String, refresh_token: String);
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct EstadoServidor {
    pub en_linea: bool,
    pub latencia_ms: u32,
    /// Algún nodo de IA con el modelo cargado.
    pub ia: bool,
    pub vision: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PerfilMovil {
    pub usuario: String,
    pub nombre_visible: String,
    pub rol: String,
    /// Emoji del avatar de Cortex.
    pub avatar_ia: String,
    pub avatar_path: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Resumen {
    pub misiones: u32,
    pub misiones_activas: u32,
    pub objetos: u32,
    pub personas: u32,
    pub puntos_interes: u32,
    pub rutas: u32,
    pub reportes_compartidos: u32,
    /// Cosas que requieren atención (peligros, misiones sin documentar…).
    pub avisos: u32,
}

#[derive(uniffi::Object)]
pub struct Nucleo {
    cliente: Arc<Cliente>,
    /// Consejo del día: uno por sesión.
    consejo: Mutex<Option<String>>,
    /// Ciudad y coordenadas aproximadas por IP (sin GPS), una vez por sesión.
    ubicacion_ip: tokio::sync::Mutex<Option<(f64, f64, Option<String>)>>,
    /// Carpeta de datos de la app: un almacén SQLite por usuario.
    directorio: PathBuf,
    almacen: Mutex<Option<Arc<almacen::Almacen>>>,
    /// Sesión abierta sin conexión: el refresh token para restaurarla al volver la red.
    por_restaurar: Mutex<Option<String>>,
    /// Una sincronización a la vez; guarda el último resultado de red.
    sincronizando: tokio::sync::Mutex<(bool, Option<String>)>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Reporte {
    /// Markdown con tres secciones (tiempo, hallazgos, sugerencia).
    pub texto: String,
    pub generado_en: i64,
}

#[uniffi::export(async_runtime = "tokio")]
impl Nucleo {
    #[uniffi::constructor]
    pub fn new(servidor: String, llavero: Arc<dyn Llavero>, directorio: String) -> Arc<Self> {
        let cliente = Arc::new(Cliente::new(&servidor));
        cliente.al_renovar(Box::new(move |t| {
            llavero.guardar_sesion(t.usuario.clone(), t.refresh_token.clone());
        }));
        Arc::new(Self {
            cliente,
            consejo: Mutex::default(),
            ubicacion_ip: tokio::sync::Mutex::default(),
            directorio: PathBuf::from(directorio),
            almacen: Mutex::default(),
            por_restaurar: Mutex::default(),
            sincronizando: tokio::sync::Mutex::new((false, None)),
        })
    }

    pub fn servidor(&self) -> String {
        self.cliente.base().to_owned()
    }

    /// Login por nombre de usuario (`/v1/sesion`). Devuelve el usuario normalizado.
    pub async fn entrar(&self, usuario: String, contrasena: String) -> Result<String, ErrorKepler> {
        let u = self.cliente.entrar(&usuario, &contrasena).await?;
        self.abrir_almacen(&u)?;
        Ok(u)
    }

    /// Reabre la sesión guardada (tras Face ID) con su refresh token.
    pub async fn restaurar(&self, refresh_token: String) -> Result<String, ErrorKepler> {
        let u = self.cliente.restaurar(&refresh_token).await?;
        self.abrir_almacen(&u)?;
        *self.por_restaurar.lock().expect("por_restaurar") = None;
        Ok(u)
    }

    /// Sin conexión con la base: se trabaja con el almacén local y la sesión se
    /// restaura con `refresh_token` en la primera sincronización con red.
    pub fn entrar_sin_conexion(
        &self,
        usuario: String,
        refresh_token: String,
    ) -> Result<(), ErrorKepler> {
        self.abrir_almacen(&usuario)?;
        *self.por_restaurar.lock().expect("por_restaurar") = Some(refresh_token);
        Ok(())
    }

    pub async fn salir(&self) {
        self.cliente.salir().await;
        *self.consejo.lock().expect("consejo") = None;
        *self.ubicacion_ip.lock().await = None;
        // Lo pendiente se queda en el almacén del usuario hasta su próxima sesión
        *self.almacen.lock().expect("almacén") = None;
        *self.por_restaurar.lock().expect("por_restaurar") = None;
    }

    // --- campo: misión, rastro y cola offline ----------------------------------

    /// La misión en curso: la del dispositivo o, si no hay y hay red, la activa
    /// en el servidor (iniciada desde otro dispositivo).
    pub async fn mision_en_curso(&self) -> Result<Option<MisionEnCurso>, ErrorKepler> {
        let a = self.almacen()?;
        if let Some(m) = campo::mision(&a) {
            return Ok(Some(m));
        }
        let Ok(v) = self
            .cliente
            .get::<Vec<Value>>("/v1/misiones?estado=activa&limite=1")
            .await
        else {
            return Ok(None);
        };
        match v.first() {
            Some(m) => Ok(campo::adoptar(&a, m).map_err(almacen_err)?),
            None => Ok(None),
        }
    }

    /// Inicia una misión en el dispositivo (funciona sin conexión).
    pub fn iniciar_mision(
        &self,
        titulo: String,
        lat: Option<f64>,
        lng: Option<f64>,
    ) -> Result<MisionEnCurso, ErrorKepler> {
        let a = self.almacen()?;
        if campo::mision(&a).is_some() {
            return Err(ErrorKepler::Servidor {
                mensaje: "ya hay una misión en curso".into(),
            });
        }
        campo::iniciar(&a, titulo.trim(), lat, lng, chrono::Utc::now()).map_err(almacen_err)
    }

    /// Completa (`true`) o aborta la misión en curso.
    pub fn terminar_mision(&self, completar: bool) -> Result<Option<MisionEnCurso>, ErrorKepler> {
        let a = self.almacen()?;
        campo::terminar(&a, completar, chrono::Utc::now()).map_err(almacen_err)
    }

    /// Punto GPS de la misión en curso (sin misión no se guarda).
    pub fn registrar_punto(&self, punto: PuntoGps) -> Result<Option<MisionEnCurso>, ErrorKepler> {
        let a = self.almacen()?;
        campo::registrar(&a, &punto).map_err(almacen_err)
    }

    /// Guarda muestras de salud y sensores (se envían al sincronizar); devuelve las válidas.
    pub fn biometria_guardar(&self, muestras: Vec<MuestraBio>) -> Result<u32, ErrorKepler> {
        let a = self.almacen()?;
        biometria::guardar(&a, &muestras).map_err(almacen_err)
    }

    /// Resumen por tipo de los últimos `dias` (o de una misión), del servidor.
    pub async fn biometria_resumen(
        &self,
        dias: u32,
        mision: Option<String>,
    ) -> Result<Vec<ResumenBio>, ErrorKepler> {
        let mut ruta = format!("/v1/biometria/resumen?dias={}", dias.clamp(1, 365));
        if let Some(m) = mision {
            ruta.push_str(&format!("&mision={m}"));
        }
        let v: Value = self.cliente.get(&ruta).await?;
        Ok(biometria::resumen(&v))
    }

    /// Envía lo pendiente si hay conexión con la base.
    pub async fn sincronizar(&self) -> Result<EstadoSync, ErrorKepler> {
        let a = self.almacen()?;
        let mut guardia = self.sincronizando.lock().await;
        let refresh = self.por_restaurar.lock().expect("por_restaurar").clone();
        if let Some(r) = refresh {
            match self.cliente.restaurar(&r).await {
                Ok(_) => *self.por_restaurar.lock().expect("por_restaurar") = None,
                Err(e) => {
                    let en_linea = !matches!(e, ErrorCliente::Red(_));
                    *guardia = (en_linea, Some(e.to_string()));
                    return Ok(campo::estado(&a, en_linea, Some(e.to_string())));
                }
            }
        }
        let e = campo::sincronizar(&a, &self.cliente).await;
        *guardia = (e.en_linea, e.ultimo_error.clone());
        Ok(e)
    }

    /// Lo pendiente según el almacén, con el último resultado de red conocido.
    pub async fn estado_sync(&self) -> Result<EstadoSync, ErrorKepler> {
        let a = self.almacen()?;
        let (en_linea, error) = self.sincronizando.lock().await.clone();
        Ok(campo::estado(&a, en_linea, error))
    }

    pub async fn hay_sesion(&self) -> bool {
        self.cliente.hay_sesion().await
    }

    /// `GET /health` y su latencia; sin red, `en_linea = false`.
    pub async fn estado_servidor(&self) -> EstadoServidor {
        let (salud, latencia) = match self.cliente.salud_detalle_con_latencia().await {
            Ok(r) => r,
            Err(_) => {
                return EstadoServidor {
                    en_linea: false,
                    latencia_ms: 0,
                    ia: false,
                    vision: false,
                };
            }
        };
        estado_desde_salud(&salud, latencia)
    }

    /// Preparación de hoy, zonas de pulso y los últimos 14 días.
    pub async fn estado_fisico(&self, desfase_min: i32) -> Result<EstadoFisico, ErrorKepler> {
        let v: Value = self
            .cliente
            .get(&format!(
                "/v1/biometria/preparacion?desfase_min={desfase_min}"
            ))
            .await?;
        Ok(rendimiento::estado(&v))
    }

    pub async fn fisico(&self) -> Result<PerfilFisicoMovil, ErrorKepler> {
        let p: Value = self.cliente.get("/v1/yo").await?;
        Ok(rendimiento::fisico(&p))
    }

    pub async fn guardar_fisico(
        &self,
        fisico: PerfilFisicoMovil,
    ) -> Result<PerfilFisicoMovil, ErrorKepler> {
        let p: Value = self
            .cliente
            .patch("/v1/yo", &rendimiento::cuerpo_fisico(&fisico))
            .await?;
        Ok(rendimiento::fisico(&p))
    }

    /// Rendimiento de una misión (el servidor lo recalcula con la biometría que haya).
    pub async fn rendimiento(
        &self,
        mision: String,
        desfase_min: i32,
    ) -> Result<RendimientoMision, ErrorKepler> {
        let v: Value = self
            .cliente
            .get(&format!(
                "/v1/misiones/{mision}/rendimiento?desfase_min={desfase_min}"
            ))
            .await?;
        Ok(rendimiento::rendimiento(&v))
    }

    /// Últimas misiones con rendimiento, la más reciente primero.
    pub async fn rendimientos(&self, limite: u32) -> Result<Vec<RendimientoMision>, ErrorKepler> {
        let v: Value = self
            .cliente
            .get(&format!("/v1/rendimiento?limite={}", limite.clamp(1, 100)))
            .await?;
        Ok(v["items"]
            .as_array()
            .into_iter()
            .flatten()
            .map(rendimiento::rendimiento)
            .collect())
    }

    /// Valoración al terminar una misión (esfuerzo 1–10): va a la cola, también sin conexión.
    pub fn valorar_mision(
        &self,
        mision: String,
        esfuerzo: u8,
        sensacion: Option<String>,
    ) -> Result<(), ErrorKepler> {
        let a = self.almacen()?;
        let cuerpo =
            serde_json::json!({ "esfuerzo": esfuerzo.clamp(1, 10), "sensacion": sensacion });
        a.encolar(
            almacen::Clase::Generica,
            &format!("/v1/misiones/{mision}/valoracion"),
            &cuerpo,
            Some(&mision),
        )
        .map_err(almacen_err)
    }

    pub async fn perfil(&self) -> Result<PerfilMovil, ErrorKepler> {
        let p: Value = self.cliente.get("/v1/yo").await?;
        Ok(perfil_desde(&p))
    }

    /// Todo el panel. Con `lat`/`lng` del GPS; sin ellas, ubicación aproximada por IP.
    pub async fn panel(&self, lat: Option<f64>, lng: Option<f64>) -> Result<Panel, ErrorKepler> {
        let gps = lat.zip(lng);
        let (posicion, ciudad_ip) = match gps {
            Some(p) => (Some(p), None),
            None => match self.por_ip().await {
                Some((lat, lng, ciudad)) => (Some((lat, lng)), ciudad),
                None => (None, None),
            },
        };
        let consulta = posicion.map(|(lat, lng)| format!("lat={lat}&lng={lng}"));
        let ruta_explorador = consulta.as_ref().map_or_else(
            || "/v1/explorador".into(),
            |q| format!("/v1/explorador?{q}"),
        );
        let aire = async {
            match &consulta {
                Some(q) => self
                    .cliente
                    .get::<Value>(&format!("/v1/aire?{q}"))
                    .await
                    .ok(),
                None => None,
            }
        };
        let (dashboard, explorador, aire, salud) = tokio::join!(
            self.cliente.get::<Value>("/v1/dashboard"),
            self.cliente.get::<Value>(&ruta_explorador),
            aire,
            self.cliente.salud_detalle_con_latencia(),
        );
        let fuentes = panel::Fuentes {
            dashboard: dashboard?,
            explorador: explorador.ok(),
            aire,
            ubicacion_ip: ciudad_ip,
            gps: gps.is_some(),
            latencia_ms: salud
                .ok()
                .map(|(_, l)| u32::try_from(l.as_millis()).unwrap_or(u32::MAX)),
        };
        Ok(panel::construir(&fuentes, |s| {
            self.consejo
                .lock()
                .expect("consejo")
                .get_or_insert_with(|| panel::consejo_ahora(s))
                .clone()
        }))
    }

    /// POIs propios de una categoría (drill-down del panel).
    pub async fn pois_de_categoria(
        &self,
        categoria_id: String,
    ) -> Result<Vec<HallazgoFila>, ErrorKepler> {
        let v: Value = self
            .cliente
            .get(&format!(
                "/v1/archivos?tipo=puntos_interes&categoria={categoria_id}&limite=50"
            ))
            .await?;
        Ok(v["items"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|p| panel::hallazgo(p, "nivel_riesgo"))
            .collect())
    }

    /// «Novedades de Cortex» (en caché 1 h en el servidor salvo `forzar`).
    pub async fn reporte(
        &self,
        lat: Option<f64>,
        lng: Option<f64>,
        forzar: bool,
    ) -> Result<Reporte, ErrorKepler> {
        let mut ruta = format!("/v1/ia/reporte?forzar={forzar}");
        if let Some((lat, lng)) = lat.zip(lng) {
            ruta.push_str(&format!("&lat={lat}&lng={lng}"));
        }
        let v: Value = self.cliente.get(&ruta).await?;
        Ok(Reporte {
            texto: v["reporte"].as_str().unwrap_or_default().to_owned(),
            generado_en: v["generado_en"]
                .as_str()
                .and_then(|s| s.parse::<chrono::DateTime<chrono::Utc>>().ok())
                .map_or(0, |d| d.timestamp()),
        })
    }

    /// Guarda una captura con foto (`/v1/capturas`): el servidor calcula la
    /// huella visual y hace la Re-ID. `jpeg`: el recorte (objeto/persona) o el encuadre (POI).
    pub async fn capturar(
        &self,
        captura: NuevaCaptura,
        jpeg: Vec<u8>,
    ) -> Result<CapturaGuardada, ErrorKepler> {
        let cuerpo = captura::cuerpo(&captura, &jpeg, chrono::Utc::now());
        let a = self.almacen()?;
        // Directa si no hay nada antes en la cola (p. ej. la creación de su misión)
        if a.pendientes() == 0 && self.cliente.hay_sesion().await {
            match self.cliente.post::<Value>("/v1/capturas", &cuerpo).await {
                Ok(r) if captura::rechazada_por_mision(&r) => {
                    let r = self
                        .cliente
                        .post::<Value>("/v1/capturas", &captura::sin_mision(&cuerpo))
                        .await?;
                    return captura::resultado(&captura, &r);
                }
                Ok(r) => return captura::resultado(&captura, &r),
                Err(ErrorCliente::Red(_)) => {}
                Err(e) => return Err(e.into()),
            }
        }
        a.encolar(
            almacen::Clase::Captura,
            "/v1/capturas",
            &cuerpo,
            captura.mision_id.as_deref(),
        )
        .map_err(almacen_err)?;
        Ok(captura::en_cola(&captura, &cuerpo))
    }

    /// Categorías de POI (para reportar uno).
    pub async fn categorias_poi(&self) -> Result<Vec<CategoriaConteo>, ErrorKepler> {
        let v: Value = self.cliente.get("/v1/catalogos").await?;
        Ok(v["poi_categorias"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|k| CategoriaConteo {
                id: k["id"].as_str().unwrap_or_default().to_owned(),
                nombre: k["nombre"].as_str().unwrap_or_default().to_owned(),
                color: k["color"].as_str().unwrap_or("#888888").to_owned(),
                total: 0,
                compartidos: 0,
            })
            .collect())
    }

    // --- mapa offline -------------------------------------------------------------

    /// Regiones de mapa del servidor y si ya están en el iPhone.
    pub async fn regiones_mapa(&self) -> Result<Vec<RegionMapa>, ErrorKepler> {
        let v: Vec<Value> = self.cliente.get("/v1/mapas").await?;
        Ok(v.iter()
            .map(|r| {
                let id = r["id"].as_str().unwrap_or("mapa").to_owned();
                let tamano_mb = r["tamano_mb"].as_f64().unwrap_or(0.0);
                let local = std::fs::metadata(mapa::archivo(&self.directorio, &id))
                    .map(|m| m.len() as f64 / 1_048_576.0);
                RegionMapa {
                    descargada: local.is_ok_and(|mb| (mb - tamano_mb).abs() < 0.2),
                    id,
                    tamano_mb,
                }
            })
            .collect())
    }

    /// Ruta del estilo listo para MapLibre si hay un mapa descargado (sin red también).
    pub fn estilo_mapa(&self) -> Option<String> {
        let pmtiles = mapa::local(&self.directorio)?;
        mapa::escribir_estilo(&self.directorio, &pmtiles)
            .ok()
            .map(|r| r.display().to_string())
    }

    /// Descarga (o termina de descargar) la región y devuelve la ruta del estilo.
    pub async fn descargar_mapa(
        &self,
        region: String,
        progreso: Arc<dyn ProgresoDescarga>,
    ) -> Result<String, ErrorKepler> {
        let regiones: Vec<Value> = self.cliente.get("/v1/mapas").await?;
        let r = regiones
            .iter()
            .find(|r| r["id"] == region.as_str())
            .ok_or_else(|| ErrorKepler::Servidor {
                mensaje: format!("no hay mapa «{region}»"),
            })?;
        let url = r["url"].as_str().unwrap_or_default().to_owned();
        let destino = mapa::archivo(&self.directorio, &region);
        let _ = std::fs::create_dir_all(mapa::carpeta(&self.directorio));
        let remoto = self.cliente.tamano_remoto(&url).await?;
        if std::fs::metadata(&destino).map(|m| m.len()).ok() != Some(remoto) {
            self.cliente
                .descargar(&url, &destino, |hecho, total| progreso.avance(hecho, total))
                .await?;
        }
        mapa::escribir_estilo(&self.directorio, &destino)
            .map(|r| r.display().to_string())
            .map_err(|mensaje| ErrorKepler::Servidor { mensaje })
    }

    /// GeoJSON de POIs, alertas, hallazgos y rutas; sin red, el último guardado.
    pub async fn elementos_mapa(&self) -> Result<String, ErrorKepler> {
        let a = self.almacen()?;
        match self.cliente.get::<Value>("/v1/mapa/elementos").await {
            Ok(v) => {
                mapa::guardar_elementos(&a, &v);
                Ok(v.to_string())
            }
            Err(_) => Ok(mapa::elementos_guardados(&a).to_string()),
        }
    }

    /// GeoJSON del rastro de la misión en curso (desde el almacén local).
    pub fn rastro_mision(&self) -> Result<String, ErrorKepler> {
        let a = self.almacen()?;
        Ok(match campo::mision(&a) {
            Some(m) => mapa::rastro(&a, &m.id),
            None => serde_json::json!({ "type": "FeatureCollection", "features": [] }),
        }
        .to_string())
    }

    // --- archivos, comparador y bitácora --------------------------------------

    pub async fn archivos(
        &self,
        tipo: TipoHallazgo,
        busqueda: Option<String>,
        mision: Option<String>,
        antes: Option<i64>,
    ) -> Result<PaginaHallazgos, ErrorKepler> {
        let ruta = archivo::ruta_listado(tipo, busqueda.as_deref(), mision.as_deref(), antes);
        let v: Value = self.cliente.get(&ruta).await?;
        Ok(PaginaHallazgos {
            items: v["items"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|f| archivo::hallazgo(tipo, f))
                .collect(),
            hay_mas: v["hay_mas"] == true,
        })
    }

    /// Guarda la edición del detalle (gana el servidor si otro lo cambió antes).
    pub async fn editar_hallazgo(&self, edicion: EdicionHallazgo) -> Result<Hallazgo, ErrorKepler> {
        let tabla = edicion.tipo.tabla();
        let original: Value = self
            .cliente
            .get(&format!("/v1/archivos/{tabla}/{}", edicion.id))
            .await?;
        let fila = archivo::fila_editada(&original, &edicion, chrono::Utc::now());
        let mut f = self.subir_fila(edicion.tipo, fila).await?;
        // La fila final no trae lo calculado del listado
        f["etiquetas"] = original["etiquetas"].clone();
        Ok(archivo::hallazgo(edicion.tipo, &f))
    }

    pub async fn borrar_hallazgo(&self, tipo: TipoHallazgo, id: String) -> Result<(), ErrorKepler> {
        let original: Value = self
            .cliente
            .get(&format!("/v1/archivos/{}/{id}", tipo.tabla()))
            .await?;
        self.subir_fila(tipo, archivo::fila_borrada(&original, chrono::Utc::now()))
            .await?;
        Ok(())
    }

    /// Personas sueltas con parecidos (comparador).
    pub async fn identidades_pendientes(&self) -> Result<Vec<IdentidadPendiente>, ErrorKepler> {
        let v: Vec<Value> = self.cliente.get("/v1/identidades/pendientes").await?;
        Ok(v.iter().map(archivo::identidad).collect())
    }

    /// La persona `id` es la misma que `con` (pasa a su identidad y nombre).
    pub async fn vincular_persona(&self, id: String, con: String) -> Result<(), ErrorKepler> {
        let _: Value = self
            .cliente
            .post(
                &format!("/v1/personas/{id}/vincular"),
                &serde_json::json!({ "con": con }),
            )
            .await?;
        Ok(())
    }

    pub async fn desvincular_persona(&self, id: String) -> Result<(), ErrorKepler> {
        let _: Value = self
            .cliente
            .post(
                &format!("/v1/personas/{id}/desvincular"),
                &serde_json::json!({}),
            )
            .await?;
        Ok(())
    }

    pub async fn bitacora(
        &self,
        antes: Option<i64>,
        solo_no_leidas: bool,
    ) -> Result<PaginaBitacora, ErrorKepler> {
        let mut ruta = format!("/v1/notificaciones?limite=40&solo_no_leidas={solo_no_leidas}");
        if let Some(t) = antes.and_then(|s| chrono::DateTime::<chrono::Utc>::from_timestamp(s, 0)) {
            ruta.push_str(&format!("&antes={}", t.format("%Y-%m-%dT%H:%M:%SZ")));
        }
        let v: Value = self.cliente.get(&ruta).await?;
        Ok(PaginaBitacora {
            items: v["items"]
                .as_array()
                .into_iter()
                .flatten()
                .map(archivo::entrada)
                .collect(),
            no_leidas: u32::try_from(v["no_leidas"].as_u64().unwrap_or(0)).unwrap_or(0),
        })
    }

    /// Entradas sin leer (para el globo de la pestaña).
    pub async fn no_leidas(&self) -> Result<u32, ErrorKepler> {
        let v: Value = self
            .cliente
            .get("/v1/notificaciones?limite=1&solo_no_leidas=true")
            .await?;
        Ok(u32::try_from(v["no_leidas"].as_u64().unwrap_or(0)).unwrap_or(0))
    }

    /// Marca como leídas `ids` (vacío: todas).
    pub async fn marcar_leidas(&self, ids: Vec<String>) -> Result<(), ErrorKepler> {
        let cuerpo = if ids.is_empty() {
            serde_json::json!({ "todas": true })
        } else {
            serde_json::json!({ "ids": ids })
        };
        let _: Value = self
            .cliente
            .post("/v1/notificaciones/leer", &cuerpo)
            .await?;
        Ok(())
    }

    // --- Cortex -----------------------------------------------------------------

    pub async fn cortex_chats(&self) -> Result<Vec<ChatResumen>, ErrorKepler> {
        let v: Vec<Value> = self.cliente.get("/v1/ia/chats").await?;
        Ok(v.iter().map(cortex::resumen).collect())
    }

    pub async fn cortex_chat(&self, id: String) -> Result<Vec<MensajeCortex>, ErrorKepler> {
        let v: Value = self.cliente.get(&format!("/v1/ia/chats/{id}")).await?;
        Ok(cortex::mensajes(&v))
    }

    pub async fn cortex_borrar(&self, id: String) -> Result<(), ErrorKepler> {
        Ok(self.cliente.borrar(&format!("/v1/ia/chats/{id}")).await?)
    }

    /// Pregunta a Cortex; la respuesta llega por `oyente` mientras se escribe.
    pub async fn cortex_enviar(
        &self,
        chat_id: Option<String>,
        mensaje: String,
        lat: Option<f64>,
        lng: Option<f64>,
        desfase_min: Option<i32>,
        oyente: Arc<dyn OyenteCortex>,
    ) -> Result<FinCortex, ErrorKepler> {
        let cuerpo = serde_json::json!({ "chat_id": chat_id, "mensaje": mensaje, "lat": lat, "lng": lng,
                                         "desfase_min": desfase_min });
        self.cortex_streaming("/v1/ia/chat", &cuerpo, oyente).await
    }

    /// Deep-Dive de una entrada de la bitácora.
    pub async fn cortex_analizar(
        &self,
        notificacion_id: String,
        lat: Option<f64>,
        lng: Option<f64>,
        desfase_min: Option<i32>,
        oyente: Arc<dyn OyenteCortex>,
    ) -> Result<FinCortex, ErrorKepler> {
        let cuerpo = serde_json::json!({ "notificacion_id": notificacion_id, "lat": lat, "lng": lng,
                                         "desfase_min": desfase_min });
        self.cortex_streaming("/v1/ia/analizar", &cuerpo, oyente)
            .await
    }

    /// Bytes de una foto de Storage (`imagen_path`, `avatar_path`).
    pub async fn imagen(&self, ruta: String) -> Result<Vec<u8>, ErrorKepler> {
        Ok(self
            .cliente
            .get_bytes(&format!("/v1/imagenes/{ruta}"))
            .await?)
    }

    pub async fn resumen(&self) -> Result<Resumen, ErrorKepler> {
        let d: Value = self.cliente.get("/v1/dashboard").await?;
        Ok(resumen_desde(&d))
    }
}

impl Nucleo {
    async fn subir_fila(&self, tipo: TipoHallazgo, fila: Value) -> Result<Value, ErrorKepler> {
        let cuerpo = serde_json::json!({ tipo.tabla(): [fila] });
        let r: Value = self.cliente.post("/v1/sync/subir", &cuerpo).await?;
        archivo::resultado_subida(tipo, &r)
    }

    async fn cortex_streaming(
        &self,
        ruta: &str,
        cuerpo: &Value,
        oyente: Arc<dyn OyenteCortex>,
    ) -> Result<FinCortex, ErrorKepler> {
        let mut a = cortex::Acumulador::new(oyente);
        self.cliente
            .post_ndjson(ruta, cuerpo, |ev| a.evento(ev))
            .await?;
        a.terminar()
            .map_err(|mensaje| ErrorKepler::Servidor { mensaje })
    }

    fn abrir_almacen(&self, usuario: &str) -> Result<(), ErrorKepler> {
        let mut guardado = self.almacen.lock().expect("almacén");
        let _ = std::fs::create_dir_all(&self.directorio);
        let ruta = self.directorio.join(format!("kepler-{usuario}.sqlite"));
        *guardado = Some(Arc::new(
            almacen::Almacen::abrir(&ruta).map_err(almacen_err)?,
        ));
        Ok(())
    }

    fn almacen(&self) -> Result<Arc<almacen::Almacen>, ErrorKepler> {
        self.almacen
            .lock()
            .expect("almacén")
            .clone()
            .ok_or_else(|| ErrorKepler::NoAutorizado {
                mensaje: "sin sesión".into(),
            })
    }

    async fn por_ip(&self) -> Option<(f64, f64, Option<String>)> {
        let mut guardada = self.ubicacion_ip.lock().await;
        if guardada.is_none() {
            let v: Value = self.cliente.get("/v1/geo/ip").await.ok()?;
            if v["disponible"] == true {
                *guardada = Some((
                    v["lat"].as_f64()?,
                    v["lng"].as_f64()?,
                    v["ciudad"].as_str().map(str::to_owned),
                ));
            }
        }
        guardada.clone()
    }
}

fn almacen_err(e: rusqlite::Error) -> ErrorKepler {
    ErrorKepler::Servidor {
        mensaje: format!("almacén local: {e}"),
    }
}

/// Versión del núcleo (la muestra Ajustes).
#[uniffi::export]
pub fn version_nucleo() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// ¿Es un nombre de usuario válido? (3-30 caracteres `[a-z0-9_]`, sin distinguir mayúsculas).
#[uniffi::export]
pub fn usuario_valido(usuario: String) -> bool {
    kepler_core::NombreUsuario::desde_entrada(&usuario).is_ok()
}

fn estado_desde_salud(s: &Value, latencia: Duration) -> EstadoServidor {
    EstadoServidor {
        en_linea: s["base_datos"]["ok"] == true,
        latencia_ms: u32::try_from(latencia.as_millis()).unwrap_or(u32::MAX),
        ia: s["ollama"]
            .as_array()
            .is_some_and(|l| l.iter().any(|o| o["modelo_disponible"] == true)),
        vision: s["vision"]["ok"] == true,
    }
}

fn perfil_desde(p: &Value) -> PerfilMovil {
    let texto = |k: &str| p[k].as_str().unwrap_or_default().to_owned();
    let usuario = texto("nombre_usuario");
    let visible = p["nombre_visible"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .map_or_else(|| usuario.clone(), str::to_owned);
    PerfilMovil {
        nombre_visible: visible,
        usuario,
        rol: texto("rol"),
        avatar_ia: p["avatar_ia"]
            .as_str()
            .and_then(|a| a.strip_prefix("emoji:"))
            .unwrap_or("🤖")
            .to_owned(),
        avatar_path: p["avatar_path"].as_str().map(str::to_owned),
    }
}

pub(crate) fn resumen_desde(d: &Value) -> Resumen {
    let n = |v: &Value| u32::try_from(v.as_u64().unwrap_or(0)).unwrap_or(u32::MAX);
    let k = &d["conteos"];
    let a = &d["alertas"];
    Resumen {
        misiones: n(&k["misiones"]),
        misiones_activas: n(&k["misiones_activas"]),
        objetos: n(&k["objetos"]),
        personas: n(&k["personas"]),
        puntos_interes: n(&k["puntos_interes"]),
        rutas: n(&k["rutas"]),
        reportes_compartidos: n(&k["reportes_compartidos"]),
        avisos: n(&a["pois_riesgo_alto"])
            + n(&a["personas_hostiles"])
            + n(&a["misiones_sin_reporte"])
            + n(&a["objetos_baja_confianza"]),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn perfil_y_resumen_desde_la_api() {
        let p = perfil_desde(
            &json!({ "nombre_usuario": "lenovics", "nombre_visible": " ", "rol": "explorador", "avatar_ia": "emoji:🛰️" }),
        );
        assert_eq!(
            (p.nombre_visible.as_str(), p.avatar_ia.as_str()),
            ("lenovics", "🛰️")
        );
        let r = resumen_desde(&json!({
            "conteos": { "misiones": 3, "misiones_activas": 1, "objetos": 9, "personas": 2, "puntos_interes": 4, "rutas": 1, "reportes_compartidos": 2 },
            "alertas": { "pois_riesgo_alto": 1, "personas_hostiles": 0, "misiones_sin_reporte": 2, "objetos_baja_confianza": 1 }
        }));
        assert_eq!((r.objetos, r.avisos), (9, 4));
    }

    #[test]
    fn estado_del_servidor() {
        let s = json!({ "base_datos": { "ok": true }, "ollama": [{ "modelo_disponible": false }, { "modelo_disponible": true }], "vision": { "ok": false } });
        let e = estado_desde_salud(&s, Duration::from_millis(42));
        assert!(e.en_linea && e.ia && !e.vision);
        assert_eq!(e.latencia_ms, 42);
    }

    #[test]
    fn usuarios() {
        assert!(usuario_valido(" Lenovics ".into()));
        assert!(!usuario_valido("no vale".into()));
    }
}
