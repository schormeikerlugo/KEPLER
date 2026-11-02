//! Reloj Carbinox Edge (plataforma Kospet/Amazwear, servicio BLE `FFF0`).
//!
//! Cada notificación de `FFF1` es una trama
//! `F5 | índice u16 | total u16 | habilidad u16 | comando u16 | longitud u16 | datos`
//! (big-endian) con los datos cifrados en AES-128-CBC (IV fijo, PKCS7) y un
//! CRC32 little-endian al final. La clave del vínculo (`transferKey1`) viene
//! de la cuenta Carbinox; con ella se descifra el aleatorio que el reloj manda
//! al autenticarse (`FFFF/004C`) y se deriva la clave de la sesión. KEPLER solo
//! escucha: no envía nada al reloj y Carbinox Max sigue funcionando igual.
//! Protocolo completo en Obsidian: KEPLER/Reloj/Protocolo BLE Carbinox Edge.

use std::sync::{Arc, Mutex};

use aes::cipher::{BlockDecryptMut, KeyIvInit, block_padding::NoPadding, block_padding::Pkcs7};
use sha2::{Digest, Sha256};

use crate::ErrorKepler;
use crate::biometria::MuestraBio;

const CABECERA: usize = 11;
const INICIO: u8 = 0xF5;
const IV: [u8; 16] = *b"PQRSTUVW`abcdefZ";

const COMUN: u16 = 0xFFFF;
const PULSO: u16 = 0x0053;
const OXIGENO: u16 = 0x0055;
const PASOS: u16 = 0x0056;
const SUENO: u16 = 0x0058;
const ESTRES: u16 = 0x009D;
const PASOS_INCREMENTO: u16 = 0xB004;
const ANIMO: u16 = 0xB005;

const VINCULO_OK: u16 = 0x0049;
const AUTENTICACION: u16 = 0x004C;
const ACK: u16 = 0x0003;
const RESUMEN_DIARIO: u16 = 0xA0B8;
const RECIENTE_PULSO: u16 = 0xA0B9;
const RECIENTE_OXIGENO: u16 = 0xA0BA;
const RECIENTE_ESTRES: u16 = 0xA0BB;
const NTY: u16 = 0x0008;

/// Marcas de tiempo aceptadas (2024 … 2040): fuera de eso el dato no es fiable.
const TS_MIN: u32 = 1_704_067_200;
const TS_MAX: u32 = 2_208_988_800;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Trama {
    pub indice: u16,
    pub total: u16,
    pub habilidad: u16,
    pub comando: u16,
    pub datos: Vec<u8>,
}

fn u16_be(b: &[u8], i: usize) -> u16 {
    u16::from_be_bytes([b[i], b[i + 1]])
}

fn u16_le(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_le(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

pub fn leer_trama(b: &[u8]) -> Option<Trama> {
    if b.len() < CABECERA || b[0] != INICIO {
        return None;
    }
    let largo = u16_be(b, 9) as usize;
    let datos = b.get(CABECERA..CABECERA + largo)?.to_vec();
    Some(Trama {
        indice: u16_be(b, 1),
        total: u16_be(b, 3),
        habilidad: u16_be(b, 5),
        comando: u16_be(b, 7),
        datos,
    })
}

type Descifrador = cbc::Decryptor<aes::Aes128>;

/// Datos descifrados sin el CRC; `None` si la clave no encaja (CRC distinto).
pub fn descifrar(cifrado: &[u8], clave: &[u8; 16]) -> Option<Vec<u8>> {
    if cifrado.is_empty() || !cifrado.len().is_multiple_of(16) {
        return None;
    }
    let mut buf = cifrado.to_vec();
    if let Ok(claro) =
        Descifrador::new(clave.into(), &IV.into()).decrypt_padded_mut::<Pkcs7>(&mut buf)
        && let Some(d) = quitar_crc(claro)
    {
        return Some(d);
    }
    // Variante sin PKCS7 (relleno propio del SDK): se prueba quitando ceros
    let mut buf = cifrado.to_vec();
    let claro = Descifrador::new(clave.into(), &IV.into())
        .decrypt_padded_mut::<NoPadding>(&mut buf)
        .ok()?;
    let mut fin = claro.len();
    loop {
        if let Some(d) = quitar_crc(&claro[..fin]) {
            return Some(d);
        }
        if fin == 0 || claro[fin - 1] != 0 {
            return None;
        }
        fin -= 1;
    }
}

fn quitar_crc(d: &[u8]) -> Option<Vec<u8>> {
    if d.len() < 4 {
        return None;
    }
    let (datos, crc) = d.split_at(d.len() - 4);
    (crc32fast::hash(datos).to_le_bytes() == crc).then(|| datos.to_vec())
}

/// Clave de la sesión: los 16 primeros bytes de SHA-256(aleatorio3 ‖ clave del vínculo).
pub fn clave_sesion(aleatorio3: &[u8], vinculo: &[u8; 16]) -> [u8; 16] {
    let h = Sha256::new()
        .chain_update(aleatorio3)
        .chain_update(vinculo)
        .finalize();
    let mut k = [0u8; 16];
    k.copy_from_slice(&h[..16]);
    k
}

fn clave_hex(s: &str) -> Option<[u8; 16]> {
    hex::decode(s.trim()).ok()?.try_into().ok()
}

// --- datos de salud ------------------------------------------------------------

/// Id estable por (tipo, instante): reenviar o recibir dos veces no duplica.
fn id(tipo: &str, ts: u32) -> String {
    let h = Sha256::new()
        .chain_update(b"carbinox-edge|")
        .chain_update(tipo.as_bytes())
        .chain_update(ts.to_le_bytes())
        .finalize();
    let mut b = [0u8; 16];
    b.copy_from_slice(&h[..16]);
    uuid::Builder::from_random_bytes(b).into_uuid().to_string()
}

fn muestra(tipo: &str, valor: f64, unidad: &str, ts: u32, detalle: Option<String>) -> MuestraBio {
    MuestraBio {
        id: id(tipo, ts),
        tipo: tipo.into(),
        valor,
        unidad: unidad.into(),
        inicio: f64::from(ts),
        fin: f64::from(ts),
        fuente: Some("Carbinox Edge".into()),
        detalle,
    }
}

/// Registros de 8 bytes `[instante u32][valor u32]` (little-endian).
fn pares(d: &[u8]) -> Vec<(u32, u32)> {
    d.as_chunks::<8>()
        .0
        .iter()
        .map(|c| (u32_le(c, 0), u32_le(c, 4)))
        .collect()
}

/// Fase de sueño del reloj (1 profundo, 2 ligero, 3 despierto, 4 REM).
fn fase_sueno(t: u8) -> &'static str {
    match t {
        1 => "profundo",
        2 => "ligero",
        3 => "despierto",
        4 => "REM",
        _ => "otro",
    }
}

fn valido(ts: u32) -> bool {
    (TS_MIN..TS_MAX).contains(&ts)
}

/// Respuestas a las consultas «reciente» de Carbinox Max: `[operación][instante u32][valor u32]`.
fn reciente(
    tipo: &str,
    unidad: &str,
    rango: std::ops::RangeInclusive<u32>,
    d: &[u8],
) -> (Vec<MuestraBio>, String) {
    if d.len() < 9 {
        return (Vec::new(), String::new());
    }
    let (ts, v) = (u32_le(d, 1), u32_le(d, 5));
    let m = (valido(ts) && rango.contains(&v))
        .then(|| muestra(tipo, f64::from(v), unidad, ts, None))
        .into_iter()
        .collect();
    (m, format!("{tipo} reciente: {v}@{ts}"))
}

/// Lo que aporta una trama ya descifrada: muestras y una descripción para el registro.
pub fn interpretar(habilidad: u16, comando: u16, d: &[u8]) -> (Vec<MuestraBio>, String) {
    // Respuestas a consultas de Carbinox Max (habilidad común)
    if habilidad == COMUN {
        return match comando {
            RECIENTE_PULSO => reciente("pulso", "lpm", 25..=240, d),
            RECIENTE_OXIGENO => reciente("spo2", "%", 70..=100, d),
            RECIENTE_ESTRES => reciente("estres", "nivel", 0..=100, d),
            RESUMEN_DIARIO if d.len() >= 17 => {
                let (ts, pasos, metros, kcal) =
                    (u32_le(d, 1), u32_le(d, 5), u32_le(d, 9), u16_le(d, 13));
                // Una muestra por cuarto de hora: el total del día va creciendo
                let cuarto = ts / 900 * 900;
                let m = if valido(ts) {
                    vec![
                        muestra("pasos_hoy", f64::from(pasos), "pasos", cuarto, None),
                        muestra("distancia_hoy", f64::from(metros), "m", cuarto, None),
                        muestra("energia_hoy", f64::from(kcal), "kcal", cuarto, None),
                    ]
                } else {
                    Vec::new()
                };
                (
                    m,
                    format!("resumen del día: {pasos} pasos, {metros} m, {kcal} kcal @{ts}"),
                )
            }
            _ => (Vec::new(), String::new()),
        };
    }
    if !matches!(comando, ACK | NTY) {
        return (Vec::new(), String::new());
    }
    let puntual =
        |tipo: &str, unidad: &str, rango: std::ops::RangeInclusive<u32>, conv: fn(u32) -> f64| {
            let todos = pares(d);
            let m: Vec<MuestraBio> = todos
                .iter()
                .filter(|(ts, v)| valido(*ts) && rango.contains(v))
                .map(|&(ts, v)| muestra(tipo, conv(v), unidad, ts, None))
                .collect();
            let valores: Vec<String> = todos.iter().map(|(ts, v)| format!("{v}@{ts}")).collect();
            let texto = format!(
                "{tipo}: {} de {} válidos [{}]",
                m.len(),
                todos.len(),
                valores.join(" ")
            );
            (m, texto)
        };
    match habilidad {
        PULSO => puntual("pulso", "lpm", 25..=240, f64::from),
        OXIGENO => puntual("spo2", "%", 70..=100, f64::from),
        ESTRES => puntual("estres", "nivel", 0..=100, f64::from),
        // La app oficial guarda 3 − valor
        ANIMO => puntual("animo_reloj", "nivel", 0..=3, |v| 3.0 - f64::from(v)),
        // Registros de 32 bytes: [instante][pasos][metros][kcal u16][segundos u16]…
        PASOS | PASOS_INCREMENTO => {
            let mut m = Vec::new();
            let mut total = (0u32, 0u32, 0u32);
            for c in d.as_chunks::<32>().0 {
                let (ts, pasos, metros, kcal) =
                    (u32_le(c, 0), u32_le(c, 4), u32_le(c, 8), u16_le(c, 12));
                if !valido(ts) || pasos > 100_000 {
                    continue;
                }
                total = (total.0 + pasos, total.1 + metros, total.2 + u32::from(kcal));
                if pasos > 0 {
                    m.push(muestra("pasos", f64::from(pasos), "pasos", ts, None));
                }
                if metros > 0 {
                    m.push(muestra("distancia", f64::from(metros), "m", ts, None));
                }
                if kcal > 0 {
                    m.push(muestra("energia_activa", f64::from(kcal), "kcal", ts, None));
                }
            }
            (
                m,
                format!(
                    "pasos: +{} pasos, +{} m, +{} kcal",
                    total.0, total.1, total.2
                ),
            )
        }
        // Resumen de la noche (21 bytes) y tramos de 8: [inicio u32][minutos u16][fase][-]
        SUENO if d.len() >= 21 => {
            let m: Vec<MuestraBio> = d[21..]
                .as_chunks::<8>()
                .0
                .iter()
                .filter_map(|c| {
                    let (ts, min) = (u32_le(c, 0), u16_le(c, 4));
                    (valido(ts) && min > 0 && min < 24 * 60).then(|| {
                        let mut s = muestra(
                            "sueno",
                            f64::from(min) / 60.0,
                            "h",
                            ts,
                            Some(format!(r#"{{"fase":"{}"}}"#, fase_sueno(c[6]))),
                        );
                        s.fin = f64::from(ts) + f64::from(min) * 60.0;
                        s
                    })
                })
                .collect();
            let texto = format!(
                "sueño: {}→{} profundo {} ligero {} REM {} despierto {} (min), puntuación {}, {} tramos",
                u32_le(d, 0),
                u32_le(d, 4),
                u16_le(d, 8),
                u16_le(d, 10),
                u16_le(d, 12),
                u16_le(d, 14),
                d[17],
                m.len()
            );
            (m, texto)
        }
        _ => (Vec::new(), String::new()),
    }
}

// --- escucha pasiva -------------------------------------------------------------

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReporteReloj {
    pub habilidad: u16,
    pub comando: u16,
    /// Datos en claro (hex), si se pudieron descifrar.
    pub claro: Option<String>,
    pub descripcion: String,
    pub muestras: Vec<MuestraBio>,
    /// Se acaba de obtener la clave de sesión (guardarla para la próxima vez).
    pub sesion_nueva: bool,
}

struct Claves {
    vinculo: [u8; 16],
    sesion: Option<[u8; 16]>,
}

/// Escucha las notificaciones de `FFF1` y las descifra.
#[derive(uniffi::Object)]
pub struct RelojCarbinox {
    claves: Mutex<Claves>,
}

#[uniffi::export]
impl RelojCarbinox {
    /// `clave_vinculo` y `clave_sesion` en hex (16 bytes).
    #[uniffi::constructor]
    pub fn new(
        clave_vinculo: String,
        clave_sesion: Option<String>,
    ) -> Result<Arc<Self>, ErrorKepler> {
        let vinculo = clave_hex(&clave_vinculo).ok_or_else(|| ErrorKepler::Servidor {
            mensaje: "clave del reloj no válida".into(),
        })?;
        Ok(Arc::new(Self {
            claves: Mutex::new(Claves {
                vinculo,
                sesion: clave_sesion.as_deref().and_then(clave_hex),
            }),
        }))
    }

    /// Clave de sesión actual (hex), para reutilizarla al volver a abrir la app.
    pub fn clave_sesion(&self) -> Option<String> {
        self.claves.lock().expect("reloj").sesion.map(hex::encode)
    }

    pub fn recibir(&self, datos: Vec<u8>) -> Option<ReporteReloj> {
        let t = leer_trama(&datos)?;
        let mut claves = self.claves.lock().expect("reloj");
        let mut reporte = ReporteReloj {
            habilidad: t.habilidad,
            comando: t.comando,
            claro: None,
            descripcion: String::new(),
            muestras: Vec::new(),
            sesion_nueva: false,
        };
        if t.datos.is_empty() {
            return Some(reporte);
        }
        let de_vinculo = t.habilidad == COMUN && matches!(t.comando, VINCULO_OK | AUTENTICACION);
        let clave = if de_vinculo {
            Some(claves.vinculo)
        } else {
            claves.sesion
        };
        let Some(claro) = clave.and_then(|k| descifrar(&t.datos, &k)) else {
            reporte.descripcion = if clave.is_none() {
                "sin clave de sesión: falta ver la autenticación del reloj (reconéctalo)".into()
            } else {
                "no se pudo descifrar (¿clave de sesión antigua?)".into()
            };
            return Some(reporte);
        };
        reporte.claro = Some(hex::encode(&claro));
        if t.habilidad == COMUN && t.comando == AUTENTICACION && claro.len() >= 16 {
            claves.sesion = Some(clave_sesion(&claro[..16], &claves.vinculo));
            reporte.sesion_nueva = true;
            reporte.descripcion = "autenticación: clave de sesión obtenida".into();
        } else {
            let (m, d) = interpretar(t.habilidad, t.comando, &claro);
            reporte.muestras = m;
            reporte.descripcion = d;
        }
        Some(reporte)
    }
}

// --- cuenta Carbinox ------------------------------------------------------------

const API: &str = "https://api.amazwear.com/";

#[derive(Debug, Clone, uniffi::Record)]
pub struct RelojCuenta {
    pub mac: String,
    pub version: Option<String>,
    /// `transferKey1` (hex): la que hace falta para descifrar.
    pub clave_vinculo: Option<String>,
}

/// `base64(md5_hex(contraseña) + segundos Unix)`, como la app oficial.
fn hash_contrasena(contrasena: &str, ahora: u64) -> String {
    use base64::Engine;
    use md5::Md5;
    let md5 = hex::encode(Md5::digest(contrasena.as_bytes()));
    base64::engine::general_purpose::STANDARD.encode(format!("{md5}{ahora:010}"))
}

fn error_red(e: reqwest::Error) -> ErrorKepler {
    ErrorKepler::Red {
        mensaje: format!("cuenta Carbinox: {e}"),
    }
}

fn respuesta(v: serde_json::Value) -> Result<serde_json::Value, ErrorKepler> {
    if v["success"].as_bool() == Some(true) {
        Ok(v["data"].clone())
    } else {
        Err(ErrorKepler::NoAutorizado {
            mensaje: format!(
                "Carbinox: {}",
                v["msg"].as_str().unwrap_or("respuesta inesperada")
            ),
        })
    }
}

/// Inicia sesión en la cuenta Carbinox del explorador y devuelve sus relojes
/// con la clave del vínculo. La contraseña solo va a api.amazwear.com.
#[uniffi::export(async_runtime = "tokio")]
pub async fn carbinox_relojes(
    correo: String,
    contrasena: String,
) -> Result<Vec<RelojCuenta>, ErrorKepler> {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(error_red)?;
    let cabeceras = |r: reqwest::RequestBuilder| {
        r.header("Tenant-Id", "111111")
            .header("Channel-Region", "overseas-oem")
            .header("Accept-Language", "es")
            .header("App-Version", "1.101.039")
    };
    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let cuerpo = serde_json::json!({
        "email": correo.trim(), "passwordHash": hash_contrasena(&contrasena, ahora), "type": 2,
        "cType": "login", "devicePushToken": "", "deviceId": uuid::Uuid::new_v4().simple().to_string(),
    });
    let v: serde_json::Value =
        cabeceras(http.post(format!("{API}amazwear-user/public/user/login")))
            .json(&cuerpo)
            .send()
            .await
            .map_err(error_red)?
            .json()
            .await
            .map_err(error_red)?;
    let token = respuesta(v)?["token"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    if token.is_empty() {
        return Err(ErrorKepler::NoAutorizado {
            mensaje: "Carbinox no devolvió sesión".into(),
        });
    }
    let v: serde_json::Value = cabeceras(http.get(format!(
        "{API}amazwear-user/app/userDevice/page?current=1&size=20"
    )))
    .header("Authorization", &token)
    .send()
    .await
    .map_err(error_red)?
    .json()
    .await
    .map_err(error_red)?;
    let texto =
        |r: &serde_json::Value, k: &str| r[k].as_str().filter(|s| !s.is_empty()).map(str::to_owned);
    Ok(respuesta(v)?["records"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|r| RelojCuenta {
            mac: texto(r, "mac").unwrap_or_default(),
            version: texto(r, "version"),
            clave_vinculo: texto(r, "deviceConnectId").filter(|k| clave_hex(k).is_some()),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use aes::cipher::BlockEncryptMut;

    use super::*;

    type Cifrador = cbc::Encryptor<aes::Aes128>;

    /// Trama como la del reloj: datos ‖ CRC32 LE, AES-CBC PKCS7.
    fn trama(habilidad: u16, comando: u16, datos: &[u8], clave: &[u8; 16]) -> Vec<u8> {
        let mut claro = datos.to_vec();
        claro.extend(crc32fast::hash(datos).to_le_bytes());
        let n = claro.len();
        let mut buf = claro.clone();
        buf.resize(n + 16 - n % 16, 0);
        let cifrado = Cifrador::new(clave.into(), &IV.into())
            .encrypt_padded_mut::<Pkcs7>(&mut buf, n)
            .unwrap()
            .to_vec();
        let mut t = vec![INICIO, 0, 1, 0, 1];
        t.extend(habilidad.to_be_bytes());
        t.extend(comando.to_be_bytes());
        t.extend((cifrado.len() as u16).to_be_bytes());
        t.extend(cifrado);
        t
    }

    #[test]
    fn lee_tramas_de_la_captura() {
        // Captura real del Edge (2026-11-02): ACK de la habilidad 005E sin datos
        let t =
            leer_trama(&hex::decode("F50001000100 5E00030000".replace(' ', "")).unwrap()).unwrap();
        assert_eq!((t.habilidad, t.comando, t.datos.len()), (0x005E, ACK, 0));
        assert!(leer_trama(&[0xF5, 0, 1]).is_none());
    }

    #[test]
    fn autenticacion_y_pulso_cifrados() {
        let vinculo = [7u8; 16];
        let reloj = RelojCarbinox::new(hex::encode(vinculo), None).unwrap();
        let r3 = [3u8; 16];
        let a = reloj
            .recibir(trama(COMUN, AUTENTICACION, &r3, &vinculo))
            .unwrap();
        assert!(a.sesion_nueva);
        let sesion = clave_sesion(&r3, &vinculo);
        assert_eq!(reloj.clave_sesion(), Some(hex::encode(sesion)));

        let ts: u32 = 1_793_000_000;
        let mut datos = Vec::new();
        for (t, v) in [(ts, 72u32), (ts + 60, 300), (5, 70)] {
            datos.extend(t.to_le_bytes());
            datos.extend(v.to_le_bytes());
        }
        let p = reloj.recibir(trama(PULSO, NTY, &datos, &sesion)).unwrap();
        assert_eq!(p.muestras.len(), 1, "{}", p.descripcion);
        assert_eq!(p.muestras[0].valor, 72.0);
        assert_eq!(p.muestras[0].id, id("pulso", ts));

        // Con otra clave el CRC no cuadra
        let otra =
            RelojCarbinox::new(hex::encode([1u8; 16]), Some(hex::encode([2u8; 16]))).unwrap();
        assert!(
            otra.recibir(trama(PULSO, NTY, &datos, &sesion))
                .unwrap()
                .claro
                .is_none()
        );
    }

    #[test]
    fn respuestas_reales_del_reloj() {
        // Descifradas del Edge el 2026-11-02 (registro del iPhone)
        let (m, _) = interpretar(
            COMUN,
            RECIENTE_PULSO,
            &hex::decode("02f80de96a56000000").unwrap(),
        );
        assert_eq!(
            (m[0].tipo.as_str(), m[0].valor, m[0].inicio),
            ("pulso", 86.0, 1_793_658_360.0)
        );
        let r = hex::decode("01ef0ee96a22000000150000000100000000000000000000000000000000000000")
            .unwrap();
        let (m, d) = interpretar(COMUN, RESUMEN_DIARIO, &r);
        assert_eq!(m[0].valor, 34.0, "{d}");
        assert_eq!(m[1].valor, 21.0);
        // Un tramo de sueño profundo de 90 min
        let mut s = vec![0u8; 21];
        s.extend(1_793_600_000u32.to_le_bytes());
        s.extend(90u16.to_le_bytes());
        s.extend([1, 0]);
        let (m, _) = interpretar(SUENO, NTY, &s);
        assert_eq!((m[0].valor, m[0].fin - m[0].inicio), (1.5, 5400.0));
        assert_eq!(m[0].detalle.as_deref(), Some(r#"{"fase":"profundo"}"#));
    }

    #[test]
    fn animo_invertido_y_hash() {
        let ts: u32 = 1_793_000_000;
        let mut d = ts.to_le_bytes().to_vec();
        d.extend(1u32.to_le_bytes());
        let (m, _) = interpretar(ANIMO, NTY, &d);
        assert_eq!(m[0].valor, 2.0);
        // md5("abc") = 900150983cd24fb0d6963f7d28e17f72
        assert_eq!(
            hash_contrasena("abc", 1_793_000_000),
            base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                "900150983cd24fb0d6963f7d28e17f721793000000"
            )
        );
    }
}
