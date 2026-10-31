use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::sincronizable;
use crate::{Meta, TipoNotificacion};

/// `notificaciones`: entradas de la bitácora.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Notificacion {
    pub id: Uuid,
    pub user_id: Uuid,
    pub mensaje: String,
    #[serde(default)]
    pub tipo: TipoNotificacion,
    #[serde(default)]
    pub leida: bool,
    /// Metadatos para el análisis Deep-Dive (origen, ids relacionados, logs).
    pub contexto: Option<Value>,
    #[serde(flatten)]
    pub meta: Meta,
}

sincronizable!(Notificacion, "notificaciones");

impl TipoNotificacion {
    /// Segundos visible como toast; `None` = persistente hasta cerrarla.
    pub const fn duracion_toast_s(self) -> Option<u32> {
        match self {
            Self::Critical => None,
            Self::Warning => Some(7),
            Self::Success => Some(4),
            Self::Info => Some(5),
        }
    }
}
