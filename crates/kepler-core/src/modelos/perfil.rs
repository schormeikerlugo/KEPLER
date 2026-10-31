use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{NombreUsuario, Rol};

/// `perfiles`: se crea por trigger al dar de alta la cuenta.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Perfil {
    pub id: Uuid,
    pub nombre_usuario: NombreUsuario,
    pub nombre_visible: Option<String>,
    pub avatar_path: Option<String>,
    /// Emoji preset o ruta de imagen del avatar del asistente.
    pub avatar_ia: Option<String>,
    pub bio: Option<String>,
    #[serde(default)]
    pub rol: Rol,
    pub ubicacion: Option<String>,
    #[serde(default)]
    pub preferencias: Value,
    pub creado_en: DateTime<Utc>,
    pub actualizado_en: DateTime<Utc>,
    pub version: i64,
}

impl Perfil {
    /// Nombre a mostrar en la interfaz.
    pub fn nombre_mostrado(&self) -> &str {
        self.nombre_visible
            .as_deref()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| self.nombre_usuario.como_str())
    }
}
