//! KEPLER · Centro de Control (escritorio).
//!
//! `KEPLER_SERVIDOR` cambia la URL de kepler-server (por defecto cortex en la LAN).

use kepler_cliente as api;

mod archivos;
mod bitacora;
mod cortex;
mod en_vivo;
mod imagenes;
mod mapa;
mod misiones;
mod modelos;
mod panel;
mod perfil;
mod tarjetas;
mod vista_mapa;
mod vivo;

use std::sync::Arc;

slint::include_modules!();

const SERVIDOR: &str = "http://192.168.68.117:8000";

fn main() -> Result<(), slint::PlatformError> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("runtime de tokio");
    let servidor = std::env::var("KEPLER_SERVIDOR").unwrap_or_else(|_| SERVIDOR.to_owned());

    let ui = AppWindow::new()?;
    panel::conectar(
        &ui,
        rt.handle().clone(),
        Arc::new(api::Cliente::new(&servidor)),
    );
    ui.run()
}
