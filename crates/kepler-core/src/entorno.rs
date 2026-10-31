//! Clasificación del clima y de la calidad del aire (datos de Open-Meteo).

use serde::{Deserialize, Serialize};

/// Categoría de clima de KEPLER, de más a menos severa.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CategoriaClima {
    Tormenta,
    VientoFuerte,
    Lluvia,
    Caluroso,
    Frio,
    Fresco,
}

impl CategoriaClima {
    /// Prioridad: tormenta > viento fuerte > lluvia > calor > frío > fresco.
    pub fn clasificar(temperatura_c: f64, lluvia_mm: f64, viento_kmh: f64) -> Self {
        match () {
            _ if lluvia_mm > 5.0 && viento_kmh > 40.0 => Self::Tormenta,
            _ if viento_kmh > 40.0 => Self::VientoFuerte,
            _ if lluvia_mm > 5.0 => Self::Lluvia,
            _ if temperatura_c > 32.0 => Self::Caluroso,
            _ if temperatura_c < 15.0 => Self::Frio,
            _ => Self::Fresco,
        }
    }

    /// Cuánto multiplica la fatiga de caminar con este clima.
    pub const fn multiplicador_fatiga(self) -> f64 {
        match self {
            Self::Tormenta => 2.2,
            Self::VientoFuerte => 1.8,
            Self::Lluvia => 1.5,
            Self::Caluroso => 1.3,
            Self::Frio => 1.2,
            Self::Fresco => 1.0,
        }
    }
}

/// Calidad del aire según el índice europeo (European AQI).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CalidadAire {
    Buena,
    Aceptable,
    Moderada,
    Pobre,
    MuyPobre,
    Extrema,
}

impl CalidadAire {
    pub fn clasificar(aqi: f64) -> Self {
        match aqi {
            a if a <= 20.0 => Self::Buena,
            a if a <= 40.0 => Self::Aceptable,
            a if a <= 60.0 => Self::Moderada,
            a if a <= 80.0 => Self::Pobre,
            a if a <= 100.0 => Self::MuyPobre,
            _ => Self::Extrema,
        }
    }

    /// "Aire %" del HUD: 100 = aire limpio, 0 = AQI ≥ 100.
    pub fn porcentaje(aqi: f64) -> f64 {
        (100.0 - aqi).clamp(0.0, 100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clima_por_prioridad() {
        assert_eq!(
            CategoriaClima::clasificar(20.0, 10.0, 50.0),
            CategoriaClima::Tormenta
        );
        assert_eq!(
            CategoriaClima::clasificar(35.0, 0.0, 50.0),
            CategoriaClima::VientoFuerte
        );
        assert_eq!(
            CategoriaClima::clasificar(35.0, 8.0, 10.0),
            CategoriaClima::Lluvia
        );
        assert_eq!(
            CategoriaClima::clasificar(35.0, 0.0, 10.0),
            CategoriaClima::Caluroso
        );
        assert_eq!(
            CategoriaClima::clasificar(10.0, 0.0, 10.0),
            CategoriaClima::Frio
        );
        assert_eq!(
            CategoriaClima::clasificar(24.0, 1.0, 10.0),
            CategoriaClima::Fresco
        );
        assert_eq!(CategoriaClima::Tormenta.multiplicador_fatiga(), 2.2);
        assert_eq!(
            serde_json::to_string(&CategoriaClima::VientoFuerte).unwrap(),
            "\"viento_fuerte\""
        );
    }

    #[test]
    fn aire() {
        assert_eq!(CalidadAire::clasificar(12.0), CalidadAire::Buena);
        assert_eq!(CalidadAire::clasificar(90.0), CalidadAire::MuyPobre);
        assert_eq!(CalidadAire::clasificar(140.0), CalidadAire::Extrema);
        assert_eq!(CalidadAire::porcentaje(12.0), 88.0);
        assert_eq!(CalidadAire::porcentaje(140.0), 0.0);
    }
}
