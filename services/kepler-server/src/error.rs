use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

/// Error de la API. Se responde como `{"error": "<codigo>", "mensaje": "..."}`.
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{0}")]
    NoAutorizado(&'static str),

    #[error("{0}")]
    NoEncontrado(&'static str),

    #[error("{0}")]
    Invalido(String),

    #[error("{0}")]
    Conflicto(String),

    #[error("error de base de datos")]
    BaseDatos(#[from] sqlx::Error),

    #[error("error interno")]
    Interno(String),
}

pub type ApiResult<T> = Result<T, ApiError>;

impl From<kepler_core::Error> for ApiError {
    fn from(e: kepler_core::Error) -> Self {
        match e {
            kepler_core::Error::TransicionInvalida { .. } => Self::Conflicto(e.to_string()),
            otro => Self::Invalido(otro.to_string()),
        }
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self {
        Self::Invalido(e.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (estado, codigo) = match &self {
            Self::NoAutorizado(_) => (StatusCode::UNAUTHORIZED, "no_autorizado"),
            Self::NoEncontrado(_) => (StatusCode::NOT_FOUND, "no_encontrado"),
            Self::Invalido(_) => (StatusCode::UNPROCESSABLE_ENTITY, "invalido"),
            Self::Conflicto(_) => (StatusCode::CONFLICT, "conflicto"),
            Self::BaseDatos(e) => {
                // Violaciones de RLS / check / FK: culpa del cliente, no del servidor
                if let sqlx::Error::Database(db) = e
                    && let Some(code) = db.code()
                    && matches!(
                        code.as_ref(),
                        "42501" | "23514" | "23503" | "23505" | "22P02"
                    )
                {
                    return (
                        StatusCode::UNPROCESSABLE_ENTITY,
                        Json(json!({ "error": "rechazado", "mensaje": db.message() })),
                    )
                        .into_response();
                }
                tracing::error!(error = %e, "base de datos");
                (StatusCode::INTERNAL_SERVER_ERROR, "base_datos")
            }
            Self::Interno(detalle) => {
                tracing::error!(%detalle, "interno");
                (StatusCode::INTERNAL_SERVER_ERROR, "interno")
            }
        };
        (
            estado,
            Json(json!({ "error": codigo, "mensaje": self.to_string() })),
        )
            .into_response()
    }
}
