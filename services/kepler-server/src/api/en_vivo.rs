//! `GET /v1/en-vivo` — WebSocket binario con `kepler-proto`.
//!
//! 1. El cliente se autentica con `Authorization: Bearer <jwt>` al conectar.
//! 2. Debe enviar `Hola` en 10 s; el servidor responde `Bienvenida`.
//! 3. Unidad de campo: el GPS se guarda en `rastro_gps` y se confirma con
//!    `Ack`; GPS, estado, detecciones y fotogramas se reenvían a las demás
//!    sesiones del usuario.
//! 4. Centro de control: recibe lo reenviado (fotogramas solo si se suscribe).
//! 5. Detección en el servidor: si la unidad de campo lo pide en `Hola`
//!    (`deteccion_servidor`), cada `Fotograma` pasa por YOLO26 + ByteTrack y
//!    se responde con `Detecciones` (también reenviadas al centro de control).

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use kepler_proto::v1::{
    Ack, Bienvenida, Caja, CodigoError, Deteccion, Detecciones, Error as ErrorProto, Fotograma,
    Hola, MuestraGps, OrigenDeteccion, Pong, TipoCliente,
};
use kepler_proto::{
    Contenido, Emisor, Envoltura, TAMANO_MAXIMO, VERSION_PROTOCOLO, bytes_a_uuid, codificar,
    decodificar, uuid_a_bytes,
};
use tokio::sync::broadcast::error::RecvError;
use uuid::Uuid;

use kepler_vision::{Modelos, Rastreador};

use super::misiones::{PuntoNuevo, insertar_punto};
use crate::auth::Sesion;
use crate::difusor::{Clase, Relevo};
use crate::estado::Estado;

const ESPERA_HOLA: Duration = Duration::from_secs(10);
/// Mismo margen que el verificador de JWT.
const MARGEN_CADUCIDAD_S: i64 = 30;
/// Confianza mínima de YOLO para pasar al rastreador (ByteTrack usa también las bajas).
const UMBRAL_DETECCION: f32 = 0.25;

pub async fn conectar(
    State(estado): State<Estado>,
    sesion: Sesion,
    ws: WebSocketUpgrade,
) -> Response {
    ws.max_message_size(TAMANO_MAXIMO)
        .on_upgrade(move |socket| async move { Conexion::atender(socket, estado, sesion).await })
}

struct Conexion {
    estado: Estado,
    sesion: Sesion,
    id: Uuid,
    tipo: TipoCliente,
    emisor: Emisor,
    /// Centro de control: sesión de campo a seguir (`None` = todas) y si quiere fotogramas.
    seguir: Option<Uuid>,
    fotogramas: bool,
    /// Detección en el servidor (unidad de campo que lo pidió y modelos cargados).
    deteccion: Option<(Arc<Modelos>, Rastreador)>,
    /// Misión del último GPS recibido, para etiquetar las detecciones.
    mision_actual: Vec<u8>,
}

type Salida = futures_util::stream::SplitSink<WebSocket, Message>;

impl Conexion {
    async fn atender(socket: WebSocket, estado: Estado, sesion: Sesion) {
        let (mut salida, mut entrada) = socket.split();

        let Some(hola) = esperar_hola(&mut entrada).await else {
            let mut emisor = Emisor::default();
            let _ = enviar_error(
                &mut salida,
                &mut emisor,
                CodigoError::MensajeInvalido,
                "se esperaba Hola",
                0,
            )
            .await;
            return;
        };
        if hola.version_protocolo != VERSION_PROTOCOLO || hola.tipo() == TipoCliente::Desconocido {
            let mut emisor = Emisor::default();
            let _ = enviar_error(
                &mut salida,
                &mut emisor,
                CodigoError::VersionIncompatible,
                &format!("se requiere protocolo {VERSION_PROTOCOLO} y tipo de cliente"),
                0,
            )
            .await;
            return;
        }

        let mut c = Conexion {
            id: Uuid::now_v7(),
            tipo: hola.tipo(),
            estado,
            sesion,
            emisor: Emisor::default(),
            seguir: None,
            fotogramas: false,
            deteccion: None,
            mision_actual: Vec::new(),
        };
        if hola.deteccion_servidor && c.tipo == TipoCliente::UnidadCampo {
            match &c.estado.vision {
                Ok(m) => c.deteccion = Some((m.clone(), Rastreador::default())),
                Err(motivo) => {
                    let aviso = format!("detección en el servidor no disponible: {motivo}");
                    let _ =
                        enviar_error(&mut salida, &mut c.emisor, CodigoError::Interno, &aviso, 0)
                            .await;
                }
            }
        }
        tracing::info!(user = %c.sesion.user_id, sesion = %c.id, tipo = ?c.tipo, dispositivo = %hola.dispositivo, "en vivo: conectado");

        let bienvenida = Bienvenida {
            version_protocolo: VERSION_PROTOCOLO,
            sesion_id: uuid_a_bytes(c.id),
            hora_servidor_ms: ahora_ms(),
        };
        if c.enviar(&mut salida, bienvenida).await.is_err() {
            return;
        }

        let mut relevos = c.estado.difusor.suscribir(c.sesion.user_id);
        loop {
            // El JWT caduca: sin un Renovar a tiempo, se cierra (con el margen del verificador)
            let restante =
                (c.sesion.expira + MARGEN_CADUCIDAD_S - chrono::Utc::now().timestamp()).max(0);
            tokio::select! {
                () = tokio::time::sleep(Duration::from_secs(restante as u64)) => {
                    let _ = enviar_error(&mut salida, &mut c.emisor, CodigoError::TokenCaducado,
                                         "la sesión caducó: reconecta con un token nuevo", 0).await;
                    tracing::info!(sesion = %c.id, "en vivo: token caducado");
                    break;
                }
                mensaje = entrada.next() => match mensaje {
                    Some(Ok(Message::Binary(bytes))) => {
                        if c.recibir(&mut salida, &bytes).await.is_err() { break; }
                    }
                    Some(Ok(Message::Text(_))) => {
                        let _ = enviar_error(&mut salida, &mut c.emisor, CodigoError::MensajeInvalido, "solo binario (protobuf)", 0).await;
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(_)) => {} // ping/pong de WebSocket: los gestiona axum
                },
                relevo = relevos.recv() => match relevo {
                    Ok(r) if c.interesa(&r) => {
                        if salida.send(Message::Binary(r.bytes.clone().into())).await.is_err() { break; }
                    }
                    Ok(_) => {}
                    Err(RecvError::Lagged(perdidos)) => tracing::debug!(perdidos, "en vivo: receptor atrasado"),
                    Err(RecvError::Closed) => break,
                },
            }
        }

        drop(relevos);
        c.estado.difusor.desuscribir(c.sesion.user_id);
        tracing::info!(sesion = %c.id, "en vivo: desconectado");
    }

    /// ¿Debe esta conexión recibir el relevo?
    fn interesa(&self, r: &Relevo) -> bool {
        match r.origen {
            // Eventos del servidor: a todas las sesiones
            None => true,
            Some(origen) if origen == self.id => false,
            Some(origen) => {
                self.tipo == TipoCliente::CentroControl
                    && self.seguir.is_none_or(|s| s == origen)
                    && (r.clase != Clase::Fotograma || self.fotogramas)
            }
        }
    }

    async fn recibir(&mut self, salida: &mut Salida, bytes: &[u8]) -> Result<(), axum::Error> {
        let mut envoltura = match decodificar(bytes) {
            Ok(e) => e,
            Err(e) => {
                return enviar_error(
                    salida,
                    &mut self.emisor,
                    CodigoError::MensajeInvalido,
                    &e.to_string(),
                    0,
                )
                .await;
            }
        };
        let secuencia = envoltura.secuencia;
        let es_campo = self.tipo == TipoCliente::UnidadCampo;

        match envoltura.contenido.as_ref() {
            Some(Contenido::Ping(p)) => self.enviar(salida, Pong { nonce: p.nonce }).await,
            // Token nuevo del mismo usuario: la sesión sigue sin reconectar
            Some(Contenido::Renovar(r)) => match self.estado.verificador.verificar(&r.jwt) {
                Ok(nueva) if nueva.user_id == self.sesion.user_id => {
                    self.sesion = nueva;
                    self.enviar(salida, Ack { secuencia }).await
                }
                _ => {
                    enviar_error(
                        salida,
                        &mut self.emisor,
                        CodigoError::NoAutorizado,
                        "token de renovación inválido",
                        secuencia,
                    )
                    .await
                }
            },
            Some(Contenido::Suscripcion(s)) if !es_campo => {
                self.seguir = if s.sesion_id.is_empty() {
                    None
                } else {
                    bytes_a_uuid(&s.sesion_id).ok()
                };
                self.fotogramas = s.fotogramas;
                Ok(())
            }
            Some(Contenido::Gps(g)) if es_campo => match self.guardar_gps(g).await {
                Ok(()) => {
                    self.mision_actual = g.mision_id.clone();
                    self.reenviar(&mut envoltura, Clase::Otro);
                    self.enviar(salida, Ack { secuencia }).await
                }
                Err(motivo) => {
                    enviar_error(
                        salida,
                        &mut self.emisor,
                        CodigoError::MensajeInvalido,
                        &motivo,
                        secuencia,
                    )
                    .await
                }
            },
            Some(Contenido::Dispositivo(_) | Contenido::Detecciones(_)) if es_campo => {
                self.reenviar(&mut envoltura, Clase::Otro);
                Ok(())
            }
            Some(Contenido::Fotograma(f)) if es_campo => {
                let fotograma = f.clone();
                self.reenviar(&mut envoltura, Clase::Fotograma);
                if self.deteccion.is_some() {
                    self.detectar(salida, fotograma, secuencia).await
                } else {
                    Ok(())
                }
            }
            _ => {
                enviar_error(
                    salida,
                    &mut self.emisor,
                    CodigoError::MensajeInvalido,
                    "mensaje no esperado",
                    secuencia,
                )
                .await
            }
        }
    }

    /// YOLO en un hilo de cálculo, ByteTrack aquí; responde y reenvía las detecciones.
    async fn detectar(
        &mut self,
        salida: &mut Salida,
        f: Fotograma,
        secuencia: u64,
    ) -> Result<(), axum::Error> {
        let Some((modelos, _)) = &self.deteccion else {
            return Ok(());
        };
        let modelos = modelos.clone();
        let inicio = Instant::now();
        let jpeg = f.jpeg;
        let resultado = tokio::task::spawn_blocking(move || {
            let img = kepler_vision::decodificar(&jpeg).map_err(|e| e.to_string())?;
            let dets = modelos
                .detector
                .detectar(&img, UMBRAL_DETECCION)
                .map_err(|e| e.to_string())?;
            Ok::<_, String>((img.width(), img.height(), dets))
        })
        .await
        .unwrap_or_else(|e| Err(e.to_string()));

        let (ancho, alto, dets) = match resultado {
            Ok(r) => r,
            Err(motivo) => {
                return enviar_error(
                    salida,
                    &mut self.emisor,
                    CodigoError::MensajeInvalido,
                    &motivo,
                    secuencia,
                )
                .await;
            }
        };
        let Some((_, rastreador)) = &mut self.deteccion else {
            return Ok(());
        };
        let items = rastreador
            .actualizar(dets)
            .into_iter()
            .map(|r| Deteccion {
                clase: r.deteccion.clase,
                confianza: r.deteccion.confianza,
                caja: Some(Caja {
                    x: r.deteccion.caja.x,
                    y: r.deteccion.caja.y,
                    ancho: r.deteccion.caja.ancho,
                    alto: r.deteccion.caja.alto,
                }),
                track_id: Some(r.track_id),
                distancia_m: None,
            })
            .collect();
        let detecciones = Detecciones {
            mision_id: self.mision_actual.clone(),
            fotograma: f.numero,
            ancho,
            alto,
            items,
            origen: OrigenDeteccion::Servidor.into(),
            latencia_ms: inicio.elapsed().as_secs_f32() * 1000.0,
        };
        let mut relevo = self.emisor.envolver(detecciones.clone(), ahora_ms());
        self.reenviar(&mut relevo, Clase::Otro);
        self.enviar(salida, detecciones).await
    }

    async fn guardar_gps(&self, g: &MuestraGps) -> Result<(), String> {
        let punto = PuntoNuevo {
            id: bytes_a_uuid(&g.id).map_err(|e| e.to_string())?,
            lat: g.lat,
            lng: g.lng,
            altitud: g.altitud,
            velocidad: g.velocidad.map(f64::from),
            rumbo: g.rumbo.map(f64::from),
            precision_m: g.precision_m.map(f64::from),
            registrado_en: DateTime::<Utc>::from_timestamp_millis(g.registrado_ms)
                .ok_or("registrado_ms inválido")?,
        };
        let mision_id = bytes_a_uuid(&g.mision_id).map_err(|e| e.to_string())?;

        let db = &self.estado.db;
        let resultado = async {
            let mut tx = db.como_usuario(&self.sesion).await?;
            insertar_punto(&mut tx, self.sesion.user_id, mision_id, &punto).await?;
            tx.commit().await?;
            Ok::<_, crate::error::ApiError>(())
        }
        .await;
        resultado.map_err(|e| match e {
            crate::error::ApiError::BaseDatos(sqlx::Error::Database(d)) => d.message().to_owned(),
            otro => otro.to_string(),
        })
    }

    fn reenviar(&self, envoltura: &mut Envoltura, clase: Clase) {
        envoltura.origen_sesion = uuid_a_bytes(self.id);
        self.estado.difusor.publicar(
            self.sesion.user_id,
            Relevo {
                origen: Some(self.id),
                clase,
                bytes: codificar(envoltura),
            },
        );
    }

    async fn enviar(
        &mut self,
        salida: &mut Salida,
        contenido: impl Into<Contenido>,
    ) -> Result<(), axum::Error> {
        let e = self.emisor.envolver(contenido, ahora_ms());
        salida.send(Message::Binary(codificar(&e).into())).await
    }
}

async fn esperar_hola(entrada: &mut futures_util::stream::SplitStream<WebSocket>) -> Option<Hola> {
    let mensaje = tokio::time::timeout(ESPERA_HOLA, entrada.next())
        .await
        .ok()??
        .ok()?;
    let Message::Binary(bytes) = mensaje else {
        return None;
    };
    match decodificar(&bytes).ok()?.contenido? {
        Contenido::Hola(h) => Some(h),
        _ => None,
    }
}

async fn enviar_error(
    salida: &mut Salida,
    emisor: &mut Emisor,
    codigo: CodigoError,
    mensaje: &str,
    secuencia: u64,
) -> Result<(), axum::Error> {
    let error = ErrorProto {
        codigo: codigo.into(),
        mensaje: mensaje.to_owned(),
        secuencia,
    };
    salida
        .send(Message::Binary(
            codificar(&emisor.envolver(error, ahora_ms())).into(),
        ))
        .await
}

fn ahora_ms() -> i64 {
    Utc::now().timestamp_millis()
}
