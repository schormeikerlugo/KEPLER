use thiserror::Error;

#[derive(Debug, Error)]
pub enum ErrorVision {
    #[error("modelos: {0}")]
    Modelos(String),

    #[error("imagen inválida: {0}")]
    Imagen(#[from] image::ImageError),

    #[error("inferencia: {0}")]
    Inferencia(String),
}

pub type Resultado<T> = Result<T, ErrorVision>;

impl<T> From<ort::Error<T>> for ErrorVision {
    fn from(e: ort::Error<T>) -> Self {
        Self::Inferencia(e.to_string())
    }
}
