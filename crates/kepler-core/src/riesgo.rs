//! Evaluación de riesgo de una zona o de un corredor de ruta.

use serde::{Deserialize, Serialize};

use crate::{NivelRiesgo, Seguridad};

/// Algo peligroso cerca de la ruta o del explorador.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Peligro {
    Poi(NivelRiesgo),
    PersonaHostil,
    Ruta(Seguridad),
}

impl Peligro {
    pub const fn puntos(self) -> u32 {
        match self {
            Self::Poi(NivelRiesgo::Bajo) => 1,
            Self::Poi(NivelRiesgo::Medio) => 3,
            Self::Poi(NivelRiesgo::Alto) => 7,
            Self::Poi(NivelRiesgo::Critico) => 15,
            Self::PersonaHostil => 10,
            Self::Ruta(Seguridad::Peligro) => 5,
            Self::Ruta(Seguridad::Precaucion) => 2,
            Self::Ruta(Seguridad::Seguro | Seguridad::Desconocido) => 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Evaluacion {
    pub nivel: NivelRiesgo,
    pub puntuacion: u32,
}

/// Suma de puntos → nivel: < 5 bajo, < 15 medio, < 30 alto, resto crítico.
pub fn evaluar(peligros: impl IntoIterator<Item = Peligro>) -> Evaluacion {
    let puntuacion: u32 = peligros.into_iter().map(Peligro::puntos).sum();
    let nivel = match puntuacion {
        0..5 => NivelRiesgo::Bajo,
        5..15 => NivelRiesgo::Medio,
        15..30 => NivelRiesgo::Alto,
        _ => NivelRiesgo::Critico,
    };
    Evaluacion { nivel, puntuacion }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn niveles() {
        assert_eq!(evaluar([]).nivel, NivelRiesgo::Bajo);
        assert_eq!(
            evaluar([
                Peligro::Poi(NivelRiesgo::Medio),
                Peligro::Ruta(Seguridad::Precaucion)
            ])
            .puntuacion,
            5
        );
        assert_eq!(evaluar([Peligro::PersonaHostil]).nivel, NivelRiesgo::Medio);
        assert_eq!(
            evaluar([Peligro::Poi(NivelRiesgo::Critico)]).nivel,
            NivelRiesgo::Alto
        );
        let e = evaluar([
            Peligro::Poi(NivelRiesgo::Critico),
            Peligro::PersonaHostil,
            Peligro::Ruta(Seguridad::Peligro),
        ]);
        assert_eq!((e.nivel, e.puntuacion), (NivelRiesgo::Critico, 30));
    }
}
