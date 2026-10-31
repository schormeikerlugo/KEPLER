use serde::{Deserialize, Serialize};

use crate::{Error, Resultado};

/// Radio medio de la Tierra (IUGG), en metros.
pub const RADIO_TIERRA_M: f64 = 6_371_008.8;

/// Punto geográfico WGS84 validado.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Coordenada {
    pub lat: f64,
    pub lng: f64,
}

impl Coordenada {
    pub fn new(lat: f64, lng: f64) -> Resultado<Self> {
        if (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lng) {
            Ok(Self { lat, lng })
        } else {
            Err(Error::CoordenadaInvalida { lat, lng })
        }
    }

    /// Distancia sobre la superficie terrestre (haversine), en metros.
    pub fn distancia_m(&self, otra: &Self) -> f64 {
        let (lat1, lat2) = (self.lat.to_radians(), otra.lat.to_radians());
        let dlat = lat2 - lat1;
        let dlng = (otra.lng - self.lng).to_radians();
        let a = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlng / 2.0).sin().powi(2);
        2.0 * RADIO_TIERRA_M * a.sqrt().asin()
    }

    /// Rumbo inicial hacia `otra`, en grados [0, 360).
    pub fn rumbo_hacia(&self, otra: &Self) -> f64 {
        let (lat1, lat2) = (self.lat.to_radians(), otra.lat.to_radians());
        let dlng = (otra.lng - self.lng).to_radians();
        let y = dlng.sin() * lat2.cos();
        let x = lat1.cos() * lat2.sin() - lat1.sin() * lat2.cos() * dlng.cos();
        y.atan2(x).to_degrees().rem_euclid(360.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valida_rangos() {
        assert!(Coordenada::new(10.48, -66.90).is_ok());
        assert!(Coordenada::new(91.0, 0.0).is_err());
        assert!(Coordenada::new(0.0, -181.0).is_err());
    }

    #[test]
    fn distancia_caracas_maracaibo() {
        let caracas = Coordenada::new(10.4806, -66.9036).unwrap();
        let maracaibo = Coordenada::new(10.6427, -71.6125).unwrap();
        let km = caracas.distancia_m(&maracaibo) / 1000.0;
        assert!((km - 515.0).abs() < 5.0, "{km} km");
        assert_eq!(caracas.distancia_m(&caracas), 0.0);
    }

    #[test]
    fn rumbo_cardinal() {
        let origen = Coordenada::new(0.0, 0.0).unwrap();
        let norte = Coordenada::new(1.0, 0.0).unwrap();
        let este = Coordenada::new(0.0, 1.0).unwrap();
        assert!((origen.rumbo_hacia(&norte) - 0.0).abs() < 1e-9);
        assert!((origen.rumbo_hacia(&este) - 90.0).abs() < 1e-9);
    }
}
