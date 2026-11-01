use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{Entidad, TipoConfirmacion};

/// `confirmaciones`: un explorador dice si un reporte compartido sigue ahí.
/// Solo inserción; la vigencia sale de la más reciente de cada tipo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Confirmacion {
    pub id: Uuid,
    pub user_id: Uuid,
    /// `poi` o `persona` (hostil).
    pub entidad: Entidad,
    pub registro_id: Uuid,
    pub tipo: TipoConfirmacion,
    pub creado_en: DateTime<Utc>,
}
