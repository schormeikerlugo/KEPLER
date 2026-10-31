use thiserror::Error;

/// Errores de validación y de reglas de dominio.
#[derive(Debug, Clone, PartialEq, Error)]
pub enum Error {
    #[error("usuario inválido: 3-30 caracteres, solo minúsculas, números y _")]
    UsuarioInvalido,

    #[error("coordenada fuera de rango: lat {lat}, lng {lng}")]
    CoordenadaInvalida { lat: f64, lng: f64 },

    #[error("valor desconocido para {tipo}: {valor}")]
    ValorDesconocido { tipo: &'static str, valor: String },

    #[error("transición de misión no permitida: {desde} → {hacia}")]
    TransicionInvalida {
        desde: &'static str,
        hacia: &'static str,
    },

    #[error("embedding con {0} dimensiones, se esperaban 512")]
    DimensionEmbedding(usize),
}

pub type Resultado<T> = std::result::Result<T, Error>;
