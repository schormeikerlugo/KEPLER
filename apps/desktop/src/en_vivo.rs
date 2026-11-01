//! Conexión en vivo con kepler-server (`/v1/en-vivo`, protobuf) como Centro de Control.
//! Se reconecta sola mientras haya sesión y alguien escuche los eventos: al
//! soltar el receptor se cierra.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use kepler_proto::v1::{Hola, Ping, Suscripcion, TipoCliente};
use kepler_proto::{Contenido, Emisor, bytes_a_uuid, codificar, decodificar};
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use uuid::Uuid;

use crate::api::Cliente;

const VERSION_PROTOCOLO: u32 = 1;
const CADA_PING: Duration = Duration::from_secs(20);
/// Sin recibir nada (ni el Pong) en este tiempo, la conexión se da por muerta.
const SILENCIO_MAX: Duration = Duration::from_secs(50);
const ESPERA_MAX: Duration = Duration::from_secs(30);

#[derive(Debug)]
pub enum Evento {
    Conectado,
    Desconectado,
    /// Algo que deja rastro en la bitácora o cambia el dashboard.
    Novedad,
    /// GPS, estado, fotograma o detecciones de una Unidad de Campo.
    Campo {
        origen: Uuid,
        contenido: Contenido,
    },
}

/// `fotogramas`: si el Centro de Control quiere el vídeo (solo con la vista en vivo abierta).
pub async fn mantener(
    cliente: Arc<Cliente>,
    eventos: UnboundedSender<Evento>,
    mut fotogramas: watch::Receiver<bool>,
) {
    let mut espera = Duration::from_secs(1);
    loop {
        if eventos.is_closed() || !cliente.hay_sesion().await {
            return;
        }
        match conectar(&cliente, &eventos, &mut fotogramas).await {
            // Estuvo conectada: reintentar enseguida
            Ok(()) => espera = Duration::from_secs(1),
            Err(motivo) => eprintln!("en vivo: {motivo}"),
        }
        let _ = eventos.send(Evento::Desconectado);
        tokio::time::sleep(espera).await;
        espera = (espera * 2).min(ESPERA_MAX);
    }
}

async fn conectar(
    cliente: &Cliente,
    eventos: &UnboundedSender<Evento>,
    fotogramas: &mut watch::Receiver<bool>,
) -> Result<(), String> {
    let token = cliente.token_vigente().await.map_err(|e| e.to_string())?;
    let url = format!("{}/v1/en-vivo", cliente.base().replacen("http", "ws", 1));
    let mut req = url.into_client_request().map_err(|e| e.to_string())?;
    req.headers_mut().insert(
        "authorization",
        format!("Bearer {token}")
            .parse()
            .map_err(|_| "token inválido")?,
    );
    let (ws, _) = tokio_tungstenite::connect_async(req)
        .await
        .map_err(|e| format!("conectar: {e}"))?;
    let (mut salida, mut entrada) = ws.split();
    let mut emisor = Emisor::default();
    let ahora = || chrono::Utc::now().timestamp_millis();

    let hola = Hola {
        version_protocolo: VERSION_PROTOCOLO,
        tipo: TipoCliente::CentroControl.into(),
        dispositivo: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        version_app: env!("CARGO_PKG_VERSION").into(),
        deteccion_servidor: false,
    };
    salida
        .send(Message::Binary(
            codificar(&emisor.envolver(hola, ahora())).into(),
        ))
        .await
        .map_err(|e| e.to_string())?;

    let mut ping = tokio::time::interval(CADA_PING);
    let mut nonce = 0u64;
    let mut bienvenida = false;
    loop {
        tokio::select! {
            () = eventos.closed() => return Ok(()),
            Ok(()) = fotogramas.changed(), if bienvenida => {
                let s = Suscripcion { sesion_id: Vec::new(), fotogramas: *fotogramas.borrow_and_update() };
                let e = emisor.envolver(s, ahora());
                salida.send(Message::Binary(codificar(&e).into())).await.map_err(|e| e.to_string())?;
            }
            _ = ping.tick() => {
                nonce += 1;
                let e = emisor.envolver(Ping { nonce }, ahora());
                salida.send(Message::Binary(codificar(&e).into())).await.map_err(|e| e.to_string())?;
            }
            mensaje = tokio::time::timeout(SILENCIO_MAX, entrada.next()) => {
                let bytes = match mensaje {
                    Err(_) => return Err("sin respuesta del servidor".into()),
                    Ok(None) | Ok(Some(Ok(Message::Close(_)))) => {
                        return if bienvenida { Ok(()) } else { Err("cerrada antes de la bienvenida".into()) };
                    }
                    Ok(Some(Err(e))) => return Err(e.to_string()),
                    Ok(Some(Ok(Message::Binary(b)))) => b,
                    Ok(Some(Ok(_))) => continue,
                };
                let Ok(envoltura) = decodificar(&bytes) else { continue };
                match envoltura.contenido {
                    Some(Contenido::Bienvenida(_)) => {
                        bienvenida = true;
                        let _ = eventos.send(Evento::Conectado);
                        // Todas las unidades del usuario; vídeo solo si se está mirando
                        let s = Suscripcion { sesion_id: Vec::new(), fotogramas: *fotogramas.borrow_and_update() };
                        let e = emisor.envolver(s, ahora());
                        salida.send(Message::Binary(codificar(&e).into())).await.map_err(|e| e.to_string())?;
                    }
                    Some(Contenido::Error(e)) => return Err(format!("servidor: {}", e.mensaje)),
                    Some(Contenido::Mision(_) | Contenido::Reporte(_) | Contenido::Captura(_)) => {
                        let _ = eventos.send(Evento::Novedad);
                    }
                    Some(c @ (Contenido::Gps(_) | Contenido::Dispositivo(_) | Contenido::Fotograma(_) | Contenido::Detecciones(_))) => {
                        if let Ok(origen) = bytes_a_uuid(&envoltura.origen_sesion) {
                            let _ = eventos.send(Evento::Campo { origen, contenido: c });
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
