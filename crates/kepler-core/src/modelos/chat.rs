use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::sincronizable;
use crate::{Meta, RolChat};

/// `chat_sesiones`: una conversación con Cortex.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatSesion {
    pub id: Uuid,
    pub user_id: Uuid,
    pub titulo: Option<String>,
    #[serde(default)]
    pub mensajes: Vec<MensajeChat>,
    #[serde(flatten)]
    pub meta: Meta,
}

sincronizable!(ChatSesion, "chat_sesiones");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MensajeChat {
    pub rol: RolChat,
    pub contenido: String,
    pub en: DateTime<Utc>,
}
