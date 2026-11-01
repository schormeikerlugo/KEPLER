use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use crate::estado::Estado;

#[derive(Serialize)]
pub struct Salud {
    estado: &'static str,
    version: &'static str,
    base_datos: Componente,
    ollama: Vec<Ollama>,
    vision: Vision,
    sesiones_en_vivo: usize,
}

#[derive(Serialize)]
struct Vision {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    clases: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct Componente {
    ok: bool,
    latencia_ms: u128,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct Ollama {
    url: String,
    ok: bool,
    modelo_disponible: bool,
}

/// `GET /health` (sin autenticación). 503 si la base de datos no responde;
/// "degradado" si no hay ningún Ollama con el modelo (la IA queda no disponible).
pub async fn salud(State(estado): State<Estado>) -> (StatusCode, Json<Salud>) {
    let inicio = Instant::now();
    let db = sqlx::query_scalar::<_, i32>("select 1")
        .fetch_one(&estado.db.pool)
        .await;
    let base_datos = Componente {
        ok: db.is_ok(),
        latencia_ms: inicio.elapsed().as_millis(),
        error: db.err().map(|e| e.to_string()),
    };

    let consultas = estado
        .config
        .ollama_urls
        .iter()
        .map(|url| consultar_ollama(&estado, url));
    let ollama = futures_util::future::join_all(consultas).await;

    let ia_ok = ollama.iter().any(|o| o.modelo_disponible);
    let (codigo, texto) = match (base_datos.ok, ia_ok) {
        (false, _) => (StatusCode::SERVICE_UNAVAILABLE, "caido"),
        (true, false) => (StatusCode::OK, "degradado"),
        (true, true) => (StatusCode::OK, "ok"),
    };

    (
        codigo,
        Json(Salud {
            estado: texto,
            version: kepler_core::VERSION,
            base_datos,
            ollama,
            vision: match &estado.vision {
                Ok(m) => Vision {
                    ok: true,
                    clases: Some(m.detector.clases().len()),
                    error: None,
                },
                Err(e) => Vision {
                    ok: false,
                    clases: None,
                    error: Some(e.clone()),
                },
            },
            sesiones_en_vivo: estado.difusor.sesiones(),
        }),
    )
}

async fn consultar_ollama(estado: &Estado, url: &str) -> Ollama {
    #[derive(serde::Deserialize)]
    struct Tags {
        models: Vec<Modelo>,
    }
    #[derive(serde::Deserialize)]
    struct Modelo {
        name: String,
    }

    let respuesta = estado
        .http
        .get(format!("{}/api/tags", url.trim_end_matches('/')))
        .timeout(Duration::from_secs(2))
        .send()
        .await;
    let tags = match respuesta {
        Ok(r) if r.status().is_success() => r.json::<Tags>().await.ok(),
        _ => None,
    };
    Ollama {
        url: url.to_owned(),
        ok: tags.is_some(),
        modelo_disponible: tags.is_some_and(|t| {
            t.models
                .iter()
                .any(|m| m.name == estado.config.ollama_modelo)
        }),
    }
}
