use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// `categorias`: taxonomía global de objetos (solo lectura para clientes).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Categoria {
    pub id: Uuid,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub color: String,
    pub icono: String,
    pub orden: i32,
    pub creado_en: DateTime<Utc>,
}

/// `subcategorias`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Subcategoria {
    pub id: Uuid,
    pub categoria_id: Uuid,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub creado_en: DateTime<Utc>,
}

/// `poi_categorias`: salud · descanso · muestra · peligro.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PoiCategoria {
    pub id: Uuid,
    pub clave: String,
    pub nombre: String,
    pub color: String,
    pub icono: String,
    pub orden: i32,
    pub creado_en: DateTime<Utc>,
}
