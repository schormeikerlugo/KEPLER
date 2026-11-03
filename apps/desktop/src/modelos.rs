//! Respuestas de kepler-server que usa el Centro de Control.

use chrono::{DateTime, NaiveDate, Utc};
use kepler_core::entorno::{CalidadAire, CategoriaClima};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub struct Perfil {
    pub nombre_usuario: Option<String>,
    pub nombre_visible: Option<String>,
    pub rol: String,
    #[serde(default)]
    pub avatar_ia: Option<String>,
    #[serde(default)]
    pub avatar_path: Option<String>,
    #[serde(default)]
    pub bio: Option<String>,
    #[serde(default)]
    pub ubicacion: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Dashboard {
    pub conteos: Conteos,
    pub recientes: Recientes,
    pub alertas: Alertas,
    pub semana: Vec<Dia>,
    #[serde(default)]
    pub objetos_por_categoria: Vec<Value>,
    #[serde(default)]
    pub objetos_frecuentes: Vec<Value>,
    #[serde(default)]
    pub pois_por_categoria: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Conteos {
    pub misiones: i64,
    pub misiones_activas: i64,
    pub objetos: i64,
    pub personas: i64,
    pub puntos_interes: i64,
    pub rutas: i64,
    pub reportes_compartidos: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Recientes {
    pub misiones: Vec<Mision>,
    #[serde(default)]
    pub personas: Vec<Value>,
    #[serde(default)]
    pub rutas: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Mision {
    pub id: String,
    pub codigo: String,
    pub titulo: Option<String>,
    pub estado: String,
    pub creado_en: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Alertas {
    pub pois_riesgo_alto: i64,
    pub personas_hostiles: i64,
    pub misiones_sin_reporte: i64,
    pub objetos_baja_confianza: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Dia {
    pub fecha: NaiveDate,
    pub distancia_km: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Explorador {
    pub desgaste_calzado: f64,
    pub resistencia: f64,
    #[serde(default)]
    pub recuperacion_h: f64,
    #[serde(default)]
    pub misiones_completadas: u64,
    #[serde(default)]
    pub distancia_total_km: f64,
    pub clima: Option<Disponible<Clima>>,
}

/// Servicio externo: datos o el motivo de que no estén (nunca valores inventados).
#[derive(Debug, Clone, Deserialize)]
pub struct Disponible<T> {
    pub disponible: bool,
    #[serde(flatten)]
    pub datos: Option<T>,
    pub motivo: Option<String>,
}

impl<T> Disponible<T> {
    pub fn datos(self) -> Result<T, String> {
        match (self.disponible, self.datos) {
            (true, Some(d)) => Ok(d),
            _ => Err(self.motivo.unwrap_or_else(|| "no disponible".into())),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Clima {
    pub temperatura_c: f64,
    pub humedad_pct: f64,
    pub viento_kmh: f64,
    pub presion_hpa: f64,
    pub uv: f64,
    pub es_dia: bool,
    pub categoria: CategoriaClima,
    pub ubicacion: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Aire {
    pub aire_pct: f64,
    pub calidad: CalidadAire,
    pub pm2_5: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UbicacionIp {
    pub lat: f64,
    pub lng: f64,
    pub ciudad: Option<String>,
}
