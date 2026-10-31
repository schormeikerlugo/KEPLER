use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::sincronizable;
use crate::{Coordenada, Dificultad, Meta, OrigenRuta, Seguridad, TipoTerreno};

/// `rutas`: planificadas antes de salir o registradas en campo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Ruta {
    pub id: Uuid,
    pub user_id: Uuid,
    pub origen: OrigenRuta,
    pub nombre: String,
    pub destino: Option<String>,
    pub tipo_terreno: Option<TipoTerreno>,
    pub dificultad: Option<Dificultad>,
    #[serde(default)]
    pub seguridad: Seguridad,
    pub distancia_km: Option<f64>,
    /// `[[lat, lng], ...]`
    #[serde(default)]
    pub waypoints: Vec<[f64; 2]>,
    pub notas: Option<String>,
    pub imagen_path: Option<String>,
    #[serde(flatten)]
    pub meta: Meta,
}

sincronizable!(Ruta, "rutas");

impl Ruta {
    /// Longitud del recorrido por los waypoints, en km.
    pub fn distancia_waypoints_km(&self) -> f64 {
        self.waypoints
            .windows(2)
            .filter_map(|par| {
                let a = Coordenada::new(par[0][0], par[0][1]).ok()?;
                let b = Coordenada::new(par[1][0], par[1][1]).ok()?;
                Some(a.distancia_m(&b))
            })
            .sum::<f64>()
            / 1000.0
    }
}
