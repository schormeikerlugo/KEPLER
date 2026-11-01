use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::sincronizable;
use crate::{Coordenada, EstadoPoi, Hostilidad, Meta, NivelRiesgo, Visibilidad};

/// `objetos`: hallazgo genérico detectado por YOLO.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Objeto {
    pub id: Uuid,
    pub user_id: Uuid,
    pub mision_id: Option<Uuid>,
    pub categoria_id: Option<Uuid>,
    pub subcategoria_id: Option<Uuid>,
    pub nombre: String,
    pub clase_yolo: Option<String>,
    pub confianza: Option<f32>,
    pub descripcion: Option<String>,
    pub descripcion_ia: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    /// Distancia al objeto medida con LiDAR, en metros.
    pub distancia_m: Option<f32>,
    pub imagen_path: Option<String>,
    #[serde(
        default,
        with = "crate::vector_pg",
        skip_serializing_if = "Option::is_none"
    )]
    pub embedding: Option<Vec<f32>>,
    /// Privado por defecto; el explorador puede compartirlo.
    #[serde(default)]
    pub visibilidad: Visibilidad,
    #[serde(default)]
    pub atributos: Value,
    #[serde(default)]
    pub contexto_ambiental: Value,
    pub capturado_en: DateTime<Utc>,
    #[serde(flatten)]
    pub meta: Meta,
}

sincronizable!(Objeto, "objetos");

/// `personas`: avistamiento de una persona.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Persona {
    pub id: Uuid,
    pub user_id: Uuid,
    pub mision_id: Option<Uuid>,
    /// Identidad canónica a la que pertenece este avistamiento (comparador / Re-ID).
    pub identidad_id: Option<Uuid>,
    pub nombre: String,
    pub alias: Option<String>,
    pub contexto: Option<String>,
    #[serde(default)]
    pub hostilidad: Hostilidad,
    pub rasgos_fisicos: Option<String>,
    pub notas: Option<String>,
    pub confianza: Option<f32>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub imagen_path: Option<String>,
    #[serde(
        default,
        with = "crate::vector_pg",
        skip_serializing_if = "Option::is_none"
    )]
    pub embedding: Option<Vec<f32>>,
    pub capturado_en: DateTime<Utc>,
    #[serde(flatten)]
    pub meta: Meta,
}

sincronizable!(Persona, "personas");

impl Persona {
    /// Id de la identidad: la vinculada o, si no hay, este mismo avistamiento.
    pub fn identidad(&self) -> Uuid {
        self.identidad_id.unwrap_or(self.id)
    }
}

/// `puntos_interes`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PuntoInteres {
    pub id: Uuid,
    pub user_id: Uuid,
    pub mision_id: Option<Uuid>,
    pub categoria_id: Option<Uuid>,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub zona: Option<String>,
    #[serde(default)]
    pub nivel_riesgo: NivelRiesgo,
    #[serde(default)]
    pub estado: EstadoPoi,
    /// Compartido por defecto: asentamientos, peligros y zonas de riesgo son de todos.
    #[serde(default = "compartido")]
    pub visibilidad: Visibilidad,
    pub clase_yolo: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub imagen_path: Option<String>,
    #[serde(
        default,
        with = "crate::vector_pg",
        skip_serializing_if = "Option::is_none"
    )]
    pub embedding: Option<Vec<f32>>,
    #[serde(default)]
    pub metadata: Value,
    pub capturado_en: DateTime<Utc>,
    #[serde(flatten)]
    pub meta: Meta,
}

sincronizable!(PuntoInteres, "puntos_interes");

fn compartido() -> Visibilidad {
    Visibilidad::Compartido
}

/// `alertas_personas`: persona hostil reportada por cualquier explorador.
/// Se comparte la descripción y la foto, nunca el nombre, el alias ni el embedding.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlertaPersona {
    pub id: Uuid,
    pub user_id: Uuid,
    pub autor: Option<String>,
    pub rasgos_fisicos: Option<String>,
    pub contexto: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub imagen_path: Option<String>,
    pub capturado_en: DateTime<Utc>,
    pub actualizado_en: DateTime<Utc>,
}

/// `etiquetas`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Etiqueta {
    pub id: Uuid,
    pub user_id: Uuid,
    pub nombre: String,
    pub color: String,
    pub creado_en: DateTime<Utc>,
}

/// `objeto_etiquetas`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObjetoEtiqueta {
    pub objeto_id: Uuid,
    pub etiqueta_id: Uuid,
    pub user_id: Uuid,
}

macro_rules! con_coordenada {
    ($($tipo:ty),+) => {$(
        impl $tipo {
            /// Ubicación del hallazgo, si se registró y es válida.
            pub fn coordenada(&self) -> Option<Coordenada> {
                Coordenada::new(self.lat?, self.lng?).ok()
            }
        }
    )+};
}

con_coordenada!(Objeto, Persona, PuntoInteres);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_fila_de_postgrest_con_columnas_extra() {
        // Así devuelve PostgREST un objeto: incluye `posicion` (generada) y el vector como texto.
        let fila = serde_json::json!({
            "id": "0192f0a0-0000-7000-8000-000000000001",
            "user_id": "0192f0a0-0000-7000-8000-000000000002",
            "mision_id": null, "categoria_id": null, "subcategoria_id": null,
            "nombre": "Cuarzo", "clase_yolo": "rock", "confianza": 0.91,
            "descripcion": null, "descripcion_ia": null,
            "lat": 10.4806, "lng": -66.9036, "distancia_m": 2.4,
            "posicion": "0101000020E6100000",
            "imagen_path": null, "embedding": "[0.1,0.2]",
            "atributos": {}, "contexto_ambiental": {},
            "capturado_en": "2026-10-31T20:00:00+00:00",
            "creado_en": "2026-10-31T20:00:00+00:00",
            "actualizado_en": "2026-10-31T20:00:00+00:00",
            "eliminado_en": null, "version": 1
        });
        let o: Objeto = serde_json::from_value(fila).unwrap();
        assert_eq!(o.nombre, "Cuarzo");
        assert_eq!(o.embedding, Some(vec![0.1, 0.2]));
        assert_eq!(o.coordenada().unwrap().lat, 10.4806);
        assert!(!o.meta.esta_eliminado());
    }

    #[test]
    fn persona_sin_identidad_es_su_propia_identidad() {
        let fila = serde_json::json!({
            "id": "0192f0a0-0000-7000-8000-000000000003",
            "user_id": "0192f0a0-0000-7000-8000-000000000002",
            "mision_id": null, "identidad_id": null, "nombre": "Persona 20:05",
            "alias": null, "contexto": null, "rasgos_fisicos": null, "notas": null,
            "confianza": null, "lat": null, "lng": null, "imagen_path": null,
            "capturado_en": "2026-10-31T20:05:00Z",
            "creado_en": "2026-10-31T20:05:00Z", "actualizado_en": "2026-10-31T20:05:00Z",
            "version": 1
        });
        let p: Persona = serde_json::from_value(fila).unwrap();
        assert_eq!(p.hostilidad, Hostilidad::Desconocido);
        assert_eq!(p.identidad(), p.id);
        assert!(p.coordenada().is_none());
    }
}
