//! Cliente de Ollama para Cortex.
//!
//! Los modelos corren solo en máquinas de la LAN (PC con GPU → Mac mini). Se
//! prueban en orden; uno que falla queda apartado [`APARTADO`] antes de volver a
//! intentarlo. Las respuestas se piden en streaming (`/api/chat`, NDJSON) y
//! pueden traer llamadas a herramientas (*tool calling* nativo de Ollama).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::mpsc;

/// Tiempo que un servidor que falló queda fuera de la rotación.
pub const APARTADO: Duration = Duration::from_secs(30);
/// Contexto: historial + herramientas + datos del explorador.
const CONTEXTO: u32 = 8192;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("ningún servidor de IA disponible ({0})")]
    SinServidor(String),
    #[error("respuesta inválida de Ollama: {0}")]
    Respuesta(String),
}

pub type Resultado<T> = Result<T, Error>;

/// Mensaje en el formato de `/api/chat`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Mensaje {
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<Llamada>,
    /// En respuestas de herramienta: cuál respondió.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
}

impl Mensaje {
    pub fn sistema(texto: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: texto.into(),
            ..Self::default()
        }
    }

    pub fn usuario(texto: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: texto.into(),
            ..Self::default()
        }
    }

    pub fn asistente(texto: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: texto.into(),
            ..Self::default()
        }
    }

    pub fn herramienta(nombre: &str, resultado: &Value) -> Self {
        Self {
            role: "tool".into(),
            content: resultado.to_string(),
            tool_name: Some(nombre.into()),
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Llamada {
    pub function: Funcion,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Funcion {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

/// Un trozo de la respuesta en streaming.
#[derive(Debug, Clone, PartialEq)]
pub enum Trozo {
    Texto(String),
    Herramientas(Vec<Llamada>),
    /// Fin, con el servidor que respondió y lo que tardó.
    Fin {
        servidor: String,
        duracion: Duration,
    },
}

pub struct Ollama {
    urls: Vec<String>,
    modelo: String,
    http: reqwest::Client,
    apartados: Mutex<HashMap<String, Instant>>,
}

impl Ollama {
    pub fn new(urls: Vec<String>, modelo: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .build()
            .expect("cliente HTTP");
        Self {
            urls: urls
                .into_iter()
                .map(|u| u.trim_end_matches('/').to_owned())
                .collect(),
            modelo: modelo.into(),
            http,
            apartados: Mutex::new(HashMap::new()),
        }
    }

    pub fn modelo(&self) -> &str {
        &self.modelo
    }

    /// Servidores en orden de preferencia, sin los apartados recientemente
    /// (si todos lo están, se prueban todos).
    fn candidatos(&self) -> Vec<String> {
        let apartados = self.apartados.lock().expect("apartados");
        let libres: Vec<String> = self
            .urls
            .iter()
            .filter(|u| apartados.get(*u).is_none_or(|t| t.elapsed() > APARTADO))
            .cloned()
            .collect();
        if libres.is_empty() {
            self.urls.clone()
        } else {
            libres
        }
    }

    fn apartar(&self, url: &str) {
        self.apartados
            .lock()
            .expect("apartados")
            .insert(url.to_owned(), Instant::now());
    }

    /// Conversación en streaming. Los trozos llegan por el canal; un error a
    /// mitad de la respuesta cierra el canal tras enviarlo.
    pub async fn conversar(
        &self,
        mensajes: &[Mensaje],
        herramientas: &[Value],
    ) -> Resultado<mpsc::Receiver<Resultado<Trozo>>> {
        let cuerpo = json!({
            "model": self.modelo,
            "messages": mensajes,
            "tools": herramientas,
            "stream": true,
            // Sin cadena de razonamiento: respuestas directas y rápidas
            "think": false,
            "options": { "temperature": 0.3, "num_ctx": CONTEXTO },
            "keep_alive": "30m",
        });
        let mut ultimo = String::from("sin servidores configurados");
        for url in self.candidatos() {
            let respuesta = self
                .http
                .post(format!("{url}/api/chat"))
                .json(&cuerpo)
                .send()
                .await;
            let r = match respuesta {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => {
                    ultimo = format!(
                        "{url}: {} {}",
                        r.status(),
                        r.text().await.unwrap_or_default()
                    );
                    self.apartar(&url);
                    continue;
                }
                Err(e) => {
                    ultimo = format!("{url}: {e}");
                    self.apartar(&url);
                    continue;
                }
            };
            let (tx, rx) = mpsc::channel(64);
            tokio::spawn(leer_ndjson(r, url, tx));
            return Ok(rx);
        }
        Err(Error::SinServidor(ultimo))
    }

    /// Respuesta completa (sin herramientas): títulos, reportes.
    pub async fn completar(&self, mensajes: &[Mensaje]) -> Resultado<String> {
        let mut rx = self.conversar(mensajes, &[]).await?;
        let mut texto = String::new();
        while let Some(t) = rx.recv().await {
            if let Trozo::Texto(s) = t? {
                texto.push_str(&s);
            }
        }
        Ok(texto.trim().to_owned())
    }
}

async fn leer_ndjson(mut r: reqwest::Response, url: String, tx: mpsc::Sender<Resultado<Trozo>>) {
    let inicio = Instant::now();
    let mut pendiente = Vec::<u8>::new();
    loop {
        let trozo = match r.chunk().await {
            Ok(Some(b)) => b,
            Ok(None) => break,
            Err(e) => {
                let _ = tx.send(Err(Error::Respuesta(e.to_string()))).await;
                return;
            }
        };
        pendiente.extend_from_slice(&trozo);
        while let Some(fin) = pendiente.iter().position(|&b| b == b'\n') {
            let linea: Vec<u8> = pendiente.drain(..=fin).collect();
            match interpretar(&linea) {
                Ok(trozos) => {
                    for t in trozos {
                        let terminado = matches!(t, Trozo::Fin { .. });
                        let t = match t {
                            Trozo::Fin { .. } => Trozo::Fin {
                                servidor: url.clone(),
                                duracion: inicio.elapsed(),
                            },
                            otro => otro,
                        };
                        if tx.send(Ok(t)).await.is_err() || terminado {
                            return;
                        }
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
            }
        }
    }
}

/// Una línea NDJSON de Ollama → trozos.
fn interpretar(linea: &[u8]) -> Resultado<Vec<Trozo>> {
    let texto = std::str::from_utf8(linea)
        .map_err(|e| Error::Respuesta(e.to_string()))?
        .trim();
    if texto.is_empty() {
        return Ok(Vec::new());
    }
    let v: Value =
        serde_json::from_str(texto).map_err(|e| Error::Respuesta(format!("{e}: {texto}")))?;
    if let Some(e) = v["error"].as_str() {
        return Err(Error::Respuesta(e.to_owned()));
    }
    let mut trozos = Vec::new();
    let m: Mensaje = serde_json::from_value(v["message"].clone()).unwrap_or_default();
    if !m.content.is_empty() {
        trozos.push(Trozo::Texto(m.content));
    }
    if !m.tool_calls.is_empty() {
        trozos.push(Trozo::Herramientas(m.tool_calls));
    }
    if v["done"] == true {
        trozos.push(Trozo::Fin {
            servidor: String::new(),
            duracion: Duration::ZERO,
        });
    }
    Ok(trozos)
}

/// Definición de una herramienta para `/api/chat`.
pub fn herramienta(nombre: &str, descripcion: &str, parametros: Value) -> Value {
    json!({
        "type": "function",
        "function": { "name": nombre, "description": descripcion, "parameters": parametros }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn interpreta_texto_herramientas_y_fin() {
        let t = interpretar(br#"{"message":{"role":"assistant","content":"Hola"},"done":false}"#)
            .unwrap();
        assert_eq!(t, vec![Trozo::Texto("Hola".into())]);
        let t = interpretar(
            br#"{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"listar_misiones","arguments":{"estado":"activa"}}}]},"done":false}"#,
        )
        .unwrap();
        assert!(matches!(&t[0], Trozo::Herramientas(l) if l[0].function.name == "listar_misiones"));
        let t =
            interpretar(br#"{"message":{"role":"assistant","content":""},"done":true}"#).unwrap();
        assert!(matches!(t[0], Trozo::Fin { .. }));
        assert!(interpretar(br#"{"error":"model not found"}"#).is_err());
    }

    /// Servidor HTTP mínimo que responde siempre lo mismo.
    async fn servidor_falso(estado: &'static str, cuerpo: &'static str) -> String {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let dir = l.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((mut s, _)) = l.accept().await {
                let mut b = [0u8; 8192];
                let _ = s.read(&mut b).await;
                let r = format!(
                    "HTTP/1.1 {estado}\r\ncontent-type: application/x-ndjson\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{cuerpo}",
                    cuerpo.len()
                );
                let _ = s.write_all(r.as_bytes()).await;
            }
        });
        format!("http://{dir}")
    }

    #[tokio::test]
    async fn salta_al_siguiente_si_el_primero_falla() {
        let caido = servidor_falso("500 Internal Server Error", "{}").await;
        let bueno = servidor_falso(
            "200 OK",
            "{\"message\":{\"role\":\"assistant\",\"content\":\"Hola \"},\"done\":false}\n{\"message\":{\"role\":\"assistant\",\"content\":\"explorador\"},\"done\":true}\n",
        )
        .await;
        let o = Ollama::new(vec![caido.clone(), bueno], "modelo");
        assert_eq!(
            o.completar(&[Mensaje::usuario("hola")]).await.unwrap(),
            "Hola explorador"
        );
        // El caído queda apartado: el siguiente intento ni lo prueba
        assert!(!o.candidatos().contains(&caido));
    }

    #[tokio::test]
    async fn sin_servidores_es_error() {
        let o = Ollama::new(vec!["http://127.0.0.1:9".into()], "modelo");
        assert!(matches!(
            o.completar(&[Mensaje::usuario("x")]).await,
            Err(Error::SinServidor(_))
        ));
    }
}
