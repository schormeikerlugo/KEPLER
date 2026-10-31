//! kepler-server: API REST + WebSocket en vivo de KEPLER.

mod api;
mod auth;
mod config;
mod db;
mod difusor;
mod error;
mod escritura;
mod estado;
mod tablas;

use std::net::SocketAddr;
use std::time::Duration;

use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::db::Db;
use crate::estado::Estado;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_ansi(std::io::IsTerminal::is_terminal(&std::io::stdout()))
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "kepler_server=info,tower_http=warn".into()),
        )
        .init();

    let config = Config::desde_entorno()?;
    tracing::info!(version = kepler_core::VERSION, direccion = %config.direccion, "iniciando kepler-server");

    let db = conectar_con_reintentos(&config.database_url).await?;
    let direccion = config.direccion;
    let app = api::router(Estado::new(config, db));

    let escucha = tokio::net::TcpListener::bind(direccion).await?;
    tracing::info!("escuchando en {direccion}");
    axum::serve(
        escucha,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(senal_de_parada())
    .await?;
    Ok(())
}

/// Al arrancar el stack todo a la vez (FleetView), la base puede tardar.
async fn conectar_con_reintentos(url: &str) -> Result<Db, sqlx::Error> {
    let mut intento = 1;
    loop {
        match Db::conectar(url).await {
            Ok(db) => return Ok(db),
            Err(e) if intento < 30 => {
                tracing::warn!(intento, error = %e, "base de datos no disponible, reintentando");
                tokio::time::sleep(Duration::from_secs(2)).await;
                intento += 1;
            }
            Err(e) => return Err(e),
        }
    }
}

async fn senal_de_parada() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminar = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminar = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminar => {},
    }
    tracing::info!("parando kepler-server");
}
