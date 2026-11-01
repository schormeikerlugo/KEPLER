//! Unidad de Campo simulada: para probar el Centro de Control sin el iPhone.
//!
//! Inicia sesión, despega una misión y envía por `/v1/en-vivo` GPS (1 Hz),
//! estado del dispositivo (cada 2 s) y fotogramas JPEG (5 fps) recortados de una
//! foto que se desplaza como si fuera vídeo. Pide detección al servidor, así que
//! el Centro de Control recibe también las cajas de YOLO.
//!
//! ```bash
//! KEPLER_USUARIO=... KEPLER_CONTRASENA=... cargo run --release -p kepler-desktop \
//!     --example unidad_campo -- models/onnx/prueba-bus.jpg [segundos]
//! ```
//! `KEPLER_SERVIDOR` cambia el servidor (por defecto cortex en la LAN).

use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use image::imageops::FilterType;
use kepler_proto::v1::{EstadoDispositivo, Fotograma, Hola, MuestraGps, Red, TipoCliente};
use kepler_proto::{Contenido, Emisor, codificar, decodificar, uuid_a_bytes};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

const ANCHO: u32 = 640;
const ALTO: u32 = 480;

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let foto = image::open(args.next().ok_or("falta la foto (JPEG/PNG)")?)?;
    let segundos: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(120);
    let servidor =
        std::env::var("KEPLER_SERVIDOR").unwrap_or_else(|_| "http://192.168.68.117:8000".into());
    let usuario = std::env::var("KEPLER_USUARIO")?;
    let contrasena = std::env::var("KEPLER_CONTRASENA")?;

    let http = reqwest::Client::new();
    let sesion: Value = http
        .post(format!("{servidor}/v1/sesion"))
        .json(&json!({ "usuario": usuario, "contrasena": contrasena }))
        .send()
        .await?
        .json()
        .await?;
    let token = sesion["access_token"]
        .as_str()
        .ok_or_else(|| format!("login: {sesion}"))?
        .to_owned();
    let (lat0, lng0) = (10.505, -66.875);
    let mision: Value = http
        .post(format!("{servidor}/v1/misiones"))
        .bearer_auth(&token)
        .json(&json!({ "titulo": "Patrulla simulada", "iniciar": true, "lat": lat0, "lng": lng0 }))
        .send()
        .await?
        .json()
        .await?;
    let mision_id: uuid::Uuid = mision["id"]
        .as_str()
        .ok_or_else(|| format!("misión: {mision}"))?
        .parse()?;
    println!("misión {} iniciada", mision["codigo"]);

    let mut req =
        format!("{}/v1/en-vivo", servidor.replacen("http", "ws", 1)).into_client_request()?;
    req.headers_mut()
        .insert("authorization", format!("Bearer {token}").parse()?);
    let (ws, _) = tokio_tungstenite::connect_async(req).await?;
    let (mut salida, mut entrada) = ws.split();
    let mut emisor = Emisor::default();
    let ahora = || chrono::Utc::now().timestamp_millis();
    let hola = Hola {
        version_protocolo: 1,
        tipo: TipoCliente::UnidadCampo.into(),
        dispositivo: "Simulador".into(),
        version_app: env!("CARGO_PKG_VERSION").into(),
        deteccion_servidor: true,
    };
    salida
        .send(Message::Binary(
            codificar(&emisor.envolver(hola, ahora())).into(),
        ))
        .await?;

    // Lo que responde el servidor (Ack, Detecciones) solo se cuenta
    let lector = tokio::spawn(async move {
        let mut detecciones = 0u32;
        while let Some(Ok(Message::Binary(b))) = entrada.next().await {
            if let Ok(e) = decodificar(&b)
                && let Some(Contenido::Detecciones(d)) = e.contenido
            {
                detecciones += 1;
                if detecciones % 25 == 1 {
                    println!(
                        "detecciones del servidor: {} objetos en {:.0} ms",
                        d.items.len(),
                        d.latencia_ms
                    );
                }
            }
        }
    });

    let inicio = Instant::now();
    let mut cuadro = tokio::time::interval(Duration::from_millis(200));
    let (mut numero, mut lat, mut lng) = (0u64, lat0, lng0);
    while inicio.elapsed() < Duration::from_secs(segundos) {
        cuadro.tick().await;
        numero += 1;
        let t = inicio.elapsed().as_secs_f64();
        let mut mensajes: Vec<Contenido> = vec![Contenido::Fotograma(fotograma(&foto, numero, t)?)];
        if numero % 5 == 0 {
            lat += 0.00012 + 0.00005 * (t / 7.0).sin();
            lng += 0.00008 * (t / 11.0).cos();
            mensajes.push(Contenido::Gps(MuestraGps {
                id: uuid_a_bytes(kepler_core::nuevo_id()),
                mision_id: uuid_a_bytes(mision_id),
                lat,
                lng,
                altitud: Some(920.0 + 40.0 * (t / 30.0).sin()),
                velocidad: Some(1.3 + 0.3 * (t / 5.0).sin() as f32),
                rumbo: Some(((t * 3.0) % 360.0) as f32),
                precision_m: Some(4.5),
                registrado_ms: ahora(),
            }));
        }
        if numero % 10 == 0 {
            mensajes.push(Contenido::Dispositivo(EstadoDispositivo {
                bateria: Some((0.86 - t as f32 / 3600.0).max(0.05)),
                cargando: false,
                termico: Some(u32::from(t > 90.0)),
                bpm: Some((96.0 + 14.0 * (t / 9.0).sin()) as u32),
                brujula: Some(((t * 3.0) % 360.0) as f32),
                red: Red::Wifi.into(),
                cola_pendiente: (numero / 50) as u32 % 4,
            }));
        }
        for m in mensajes {
            let e = emisor.envolver(m, ahora());
            salida.send(Message::Binary(codificar(&e).into())).await?;
        }
    }
    lector.abort();
    let r = http
        .post(format!("{servidor}/v1/misiones/{mision_id}/completar"))
        .bearer_auth(&token)
        .json(&json!({}))
        .send()
        .await?;
    println!(
        "misión completada ({}) tras {numero} fotogramas",
        r.status()
    );
    Ok(())
}

/// Recorte de 4:3 que recorre la foto de lado a lado.
fn fotograma(
    foto: &image::DynamicImage,
    numero: u64,
    t: f64,
) -> Result<Fotograma, image::ImageError> {
    let (w, h) = (foto.width(), foto.height());
    let alto = h.min(w * 3 / 4) * 4 / 5;
    let ancho = alto * 4 / 3;
    let recorrido = f64::from(w.saturating_sub(ancho));
    let x = (recorrido * (0.5 + 0.5 * (t / 6.0).sin())) as u32;
    let y = (h - alto) / 2;
    let recorte = foto
        .crop_imm(x, y, ancho, alto)
        .resize_exact(ANCHO, ALTO, FilterType::Triangle);
    let mut jpeg = Vec::new();
    recorte.to_rgb8().write_to(
        &mut std::io::Cursor::new(&mut jpeg),
        image::ImageFormat::Jpeg,
    )?;
    Ok(Fotograma {
        numero,
        jpeg,
        ancho: ANCHO,
        alto: ALTO,
    })
}
