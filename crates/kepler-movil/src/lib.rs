//! Núcleo de la Unidad de Campo. SwiftUI solo pinta: la sesión, la red y (en
//! próximas fases) la cola offline y la sincronización viven aquí, en Rust,
//! para compartirlos con Android en el futuro.
//!
//! Swift recibe `Nucleo` (objeto con métodos `async`), registros y errores
//! generados por UniFFI (`apps/ios/Kepler/Nucleo/kepler_movil.swift`).

use std::sync::Arc;
use std::time::Duration;

use kepler_cliente::{Cliente, Error as ErrorCliente};
use serde_json::Value;

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
}

#[uniffi::export(async_runtime = "tokio")]
impl Nucleo {
    #[uniffi::constructor]
    pub fn new(servidor: String, llavero: Arc<dyn Llavero>) -> Arc<Self> {
        let cliente = Arc::new(Cliente::new(&servidor));
        cliente.al_renovar(Box::new(move |t| {
            llavero.guardar_sesion(t.usuario.clone(), t.refresh_token.clone());
        }));
        Arc::new(Self { cliente })
    }

    pub fn servidor(&self) -> String {
        self.cliente.base().to_owned()
    }

    /// Login por nombre de usuario (`/v1/sesion`). Devuelve el usuario normalizado.
    pub async fn entrar(&self, usuario: String, contrasena: String) -> Result<String, ErrorKepler> {
        Ok(self.cliente.entrar(&usuario, &contrasena).await?)
    }

    /// Reabre la sesión guardada (tras Face ID) con su refresh token.
    pub async fn restaurar(&self, refresh_token: String) -> Result<String, ErrorKepler> {
        Ok(self.cliente.restaurar(&refresh_token).await?)
    }

    pub async fn salir(&self) {
        self.cliente.salir().await;
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

    pub async fn perfil(&self) -> Result<PerfilMovil, ErrorKepler> {
        let p: Value = self.cliente.get("/v1/yo").await?;
        Ok(perfil_desde(&p))
    }

    pub async fn resumen(&self) -> Result<Resumen, ErrorKepler> {
        let d: Value = self.cliente.get("/v1/dashboard").await?;
        Ok(resumen_desde(&d))
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

fn resumen_desde(d: &Value) -> Resumen {
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
