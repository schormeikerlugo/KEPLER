//! Protocolo en vivo de KEPLER.
//!
//! Cada frame binario del WebSocket lleva un [`v1::Envoltura`]. El esquema vive
//! en `proto/kepler/v1/en_vivo.proto` y es la fuente para Rust y Swift.

use prost::Message;
use thiserror::Error;
use uuid::Uuid;

/// Tipos generados desde `kepler/v1/en_vivo.proto`.
#[allow(clippy::all, clippy::pedantic)]
pub mod v1 {
    include!(concat!(env!("OUT_DIR"), "/kepler.v1.rs"));
}

pub use v1::Envoltura;
pub use v1::envoltura::Contenido;

/// Versión que envían `Hola` y `Bienvenida`.
pub const VERSION_PROTOCOLO: u32 = 1;

/// Tamaño máximo de un mensaje (un fotograma JPEG cabe con holgura).
pub const TAMANO_MAXIMO: usize = 4 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum ErrorProto {
    #[error("mensaje de {0} bytes, el máximo es {TAMANO_MAXIMO}")]
    DemasiadoGrande(usize),

    #[error("mensaje mal formado: {0}")]
    Decodificacion(#[from] prost::DecodeError),

    #[error("la envoltura no trae contenido")]
    SinContenido,

    #[error("uuid de {0} bytes, se esperaban 16")]
    UuidInvalido(usize),
}

pub fn codificar(envoltura: &Envoltura) -> Vec<u8> {
    envoltura.encode_to_vec()
}

/// Decodifica un frame recibido, rechazando los vacíos o demasiado grandes.
pub fn decodificar(bytes: &[u8]) -> Result<Envoltura, ErrorProto> {
    if bytes.len() > TAMANO_MAXIMO {
        return Err(ErrorProto::DemasiadoGrande(bytes.len()));
    }
    let envoltura = Envoltura::decode(bytes)?;
    if envoltura.contenido.is_none() {
        return Err(ErrorProto::SinContenido);
    }
    Ok(envoltura)
}

pub fn uuid_a_bytes(id: Uuid) -> Vec<u8> {
    id.as_bytes().to_vec()
}

pub fn bytes_a_uuid(bytes: &[u8]) -> Result<Uuid, ErrorProto> {
    Uuid::from_slice(bytes).map_err(|_| ErrorProto::UuidInvalido(bytes.len()))
}

/// Numera los mensajes salientes de una conexión.
#[derive(Debug, Default)]
pub struct Emisor {
    siguiente: u64,
}

impl Emisor {
    pub fn envolver(&mut self, contenido: impl Into<Contenido>, ahora_ms: i64) -> Envoltura {
        self.siguiente += 1;
        Envoltura {
            secuencia: self.siguiente,
            enviado_ms: ahora_ms,
            origen_sesion: Vec::new(),
            contenido: Some(contenido.into()),
        }
    }
}

macro_rules! en_contenido {
    ($($tipo:ident => $variante:ident),+ $(,)?) => {$(
        impl From<v1::$tipo> for Contenido {
            fn from(m: v1::$tipo) -> Self {
                Contenido::$variante(m)
            }
        }
    )+};
}

en_contenido! {
    Hola => Hola,
    Bienvenida => Bienvenida,
    MuestraGps => Gps,
    EstadoDispositivo => Dispositivo,
    Fotograma => Fotograma,
    Detecciones => Detecciones,
    CapturaProcesada => Captura,
    EventoMision => Mision,
    Ack => Ack,
    Error => Error,
    Ping => Ping,
    Pong => Pong,
    Suscripcion => Suscripcion,
    ReporteCompartido => Reporte,
}

#[cfg(test)]
mod tests {
    use super::v1::*;
    use super::*;

    const AHORA: i64 = 1_793_480_000_000;

    #[test]
    fn hola_ida_y_vuelta() {
        let mut emisor = Emisor::default();
        let hola = Hola {
            version_protocolo: VERSION_PROTOCOLO,
            tipo: TipoCliente::UnidadCampo.into(),
            dispositivo: "iPhone14,3".into(),
            version_app: "0.8.0".into(),
        };
        let bytes = codificar(&emisor.envolver(hola.clone(), AHORA));
        let e = decodificar(&bytes).unwrap();
        assert_eq!(e.secuencia, 1);
        assert_eq!(e.contenido, Some(Contenido::Hola(hola)));
        assert_eq!(emisor.envolver(Ping { nonce: 7 }, AHORA).secuencia, 2);
    }

    #[test]
    fn gps_con_uuid_y_opcionales() {
        let mision = Uuid::now_v7();
        let gps = MuestraGps {
            id: uuid_a_bytes(Uuid::now_v7()),
            mision_id: uuid_a_bytes(mision),
            lat: 10.4806,
            lng: -66.9036,
            altitud: Some(905.0),
            velocidad: None,
            rumbo: Some(45.0),
            precision_m: Some(4.0),
            registrado_ms: AHORA,
        };
        let e = decodificar(&codificar(&Emisor::default().envolver(gps, AHORA))).unwrap();
        let Some(Contenido::Gps(g)) = e.contenido else {
            panic!("no es gps")
        };
        assert_eq!(bytes_a_uuid(&g.mision_id).unwrap(), mision);
        assert_eq!(g.velocidad, None);
        assert_eq!(g.altitud, Some(905.0));
    }

    #[test]
    fn detecciones_son_compactas() {
        let items = (0..10)
            .map(|i| Deteccion {
                clase: "person".into(),
                confianza: 0.87,
                caja: Some(Caja {
                    x: 0.1,
                    y: 0.2,
                    ancho: 0.3,
                    alto: 0.4,
                }),
                track_id: Some(i),
                distancia_m: Some(3.5),
            })
            .collect();
        let d = Detecciones {
            mision_id: uuid_a_bytes(Uuid::now_v7()),
            fotograma: 1200,
            ancho: 1920,
            alto: 1440,
            items,
            origen: OrigenDeteccion::Dispositivo.into(),
            latencia_ms: 18.0,
        };
        let bytes = codificar(&Emisor::default().envolver(d, AHORA));

        // El mismo contenido en JSON (uuid en texto, como lo mandaba la v0.7)
        let item = r#"{"clase":"person","confianza":0.87,"caja":{"x":0.1,"y":0.2,"ancho":0.3,"alto":0.4},"track_id":0,"distancia_m":3.5}"#;
        let json = format!(
            r#"{{"secuencia":1,"enviado_ms":{AHORA},"detecciones":{{"mision_id":"{}","fotograma":1200,"ancho":1920,"alto":1440,"items":[{}],"origen":"dispositivo","latencia_ms":18.0}}}}"#,
            Uuid::now_v7(),
            [item; 10].join(",")
        );
        assert!(
            bytes.len() * 2 < json.len(),
            "protobuf {} B vs json {} B",
            bytes.len(),
            json.len()
        );
    }

    #[test]
    fn rechaza_entradas_invalidas() {
        assert!(matches!(
            decodificar(&[0xff, 0xff, 0xff]),
            Err(ErrorProto::Decodificacion(_))
        ));
        assert!(matches!(decodificar(&[]), Err(ErrorProto::SinContenido)));
        let grande = vec![0u8; TAMANO_MAXIMO + 1];
        assert!(matches!(
            decodificar(&grande),
            Err(ErrorProto::DemasiadoGrande(_))
        ));
        assert!(matches!(
            bytes_a_uuid(&[1, 2, 3]),
            Err(ErrorProto::UuidInvalido(3))
        ));
    }

    #[test]
    fn enums_desconocidos_no_rompen() {
        // Un cliente más nuevo puede mandar valores que esta versión no conoce.
        let hola = Hola {
            tipo: 99,
            ..Default::default()
        };
        let e = decodificar(&codificar(&Emisor::default().envolver(hola, AHORA))).unwrap();
        let Some(Contenido::Hola(h)) = e.contenido else {
            panic!()
        };
        assert_eq!(h.tipo(), TipoCliente::Desconocido);
    }
}
