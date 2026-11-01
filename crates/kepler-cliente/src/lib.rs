//! Cliente HTTP de kepler-server, compartido por el Centro de Control y el
//! núcleo del iPhone. Los tokens viven en memoria; el escritorio no los guarda
//! (como el `sessionStorage` de la v0.7) y el iPhone guarda el de renovación en
//! el Llavero vía [`Cliente::al_renovar`].

use std::time::{Duration, Instant};

use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub usuario: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Salud {
    pub estado: String,
}

/// Se llama cada vez que cambian los tokens (Auth rota el refresh token en cada
/// renovación): el iPhone lo guarda en el Llavero para reabrir la sesión.
pub type AlRenovar = Box<dyn Fn(&Tokens) + Send + Sync>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("sin conexión con el servidor ({0})")]
    Red(String),
    #[error("{0}")]
    NoAutorizado(String),
    #[error("el servidor respondió {0}")]
    Servidor(String),
}

pub type Resultado<T> = Result<T, Error>;

struct Sesion {
    tokens: Tokens,
    caduca: Instant,
}

pub struct Cliente {
    http: Client,
    base: String,
    sesion: RwLock<Option<Sesion>>,
    al_renovar: std::sync::Mutex<Option<AlRenovar>>,
}

impl Cliente {
    pub fn new(base: &str) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(4))
            .user_agent(concat!("kepler/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("cliente HTTP");
        Self {
            http,
            base: base.trim_end_matches('/').to_owned(),
            sesion: RwLock::new(None),
            al_renovar: std::sync::Mutex::new(None),
        }
    }

    /// Aviso de tokens nuevos (entrar, renovar, restaurar).
    pub fn al_renovar(&self, f: AlRenovar) {
        *self.al_renovar.lock().expect("al_renovar") = Some(f);
    }

    /// Reabre una sesión guardada con su refresh token.
    pub async fn restaurar(&self, refresh_token: &str) -> Resultado<String> {
        let cuerpo = json!({ "refresh_token": refresh_token });
        let tokens: Tokens = self
            .publicar_sin_sesion("/v1/sesion/renovar", &cuerpo)
            .await?;
        let usuario = tokens.usuario.clone();
        self.guardar(tokens).await;
        Ok(usuario)
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    pub async fn entrar(&self, usuario: &str, contrasena: &str) -> Resultado<String> {
        let cuerpo = json!({ "usuario": usuario, "contrasena": contrasena });
        let tokens: Tokens = self.publicar_sin_sesion("/v1/sesion", &cuerpo).await?;
        let usuario = tokens.usuario.clone();
        self.guardar(tokens).await;
        Ok(usuario)
    }

    pub async fn salir(&self) {
        let sesion = self.sesion.write().await.take();
        if let Some(s) = sesion {
            // Revocar es cortesía: si falla, el token caduca solo.
            let _ = self
                .http
                .post(format!("{}/v1/sesion/cerrar", self.base))
                .bearer_auth(&s.tokens.access_token)
                .send()
                .await;
        }
    }

    pub async fn hay_sesion(&self) -> bool {
        self.sesion.read().await.is_some()
    }

    /// `GET /health` y la latencia de ida y vuelta.
    pub async fn salud(&self) -> Resultado<(Salud, Duration)> {
        let inicio = Instant::now();
        let r = self
            .http
            .get(format!("{}/health", self.base))
            .send()
            .await
            .map_err(red)?;
        let salud = leer(r).await?;
        Ok((salud, inicio.elapsed()))
    }

    /// `GET /health` completo y lo que tardó.
    pub async fn salud_detalle_con_latencia(&self) -> Resultado<(Value, Duration)> {
        let inicio = Instant::now();
        let v = self.salud_detalle().await?;
        Ok((v, inicio.elapsed()))
    }

    /// `GET /health` completo (base de datos, IA, visión, sesiones en vivo).
    pub async fn salud_detalle(&self) -> Resultado<Value> {
        let r = self
            .http
            .get(format!("{}/health", self.base))
            .send()
            .await
            .map_err(red)?;
        leer(r).await
    }

    /// PATCH con sesión.
    pub async fn patch<T: DeserializeOwned>(&self, ruta: &str, cuerpo: &Value) -> Resultado<T> {
        self.renovar_si_toca().await?;
        let token = self.token().await?;
        let r = self
            .http
            .patch(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .json(cuerpo)
            .send()
            .await
            .map_err(red)?;
        leer(r).await
    }

    /// PUT con sesión.
    pub async fn put<T: DeserializeOwned>(&self, ruta: &str, cuerpo: &Value) -> Resultado<T> {
        self.renovar_si_toca().await?;
        let token = self.token().await?;
        let r = self
            .http
            .put(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .json(cuerpo)
            .send()
            .await
            .map_err(red)?;
        leer(r).await
    }

    /// GET con sesión; si el token caducó, se renueva una vez y se reintenta.
    pub async fn get<T: DeserializeOwned>(&self, ruta: &str) -> Resultado<T> {
        self.renovar_si_toca().await?;
        match self.get_una_vez(ruta).await {
            Err(Error::NoAutorizado(_)) => {
                self.renovar().await?;
                self.get_una_vez(ruta).await
            }
            otro => otro,
        }
    }

    /// Bytes de una ruta con sesión (fotos).
    pub async fn get_bytes(&self, ruta: &str) -> Resultado<Vec<u8>> {
        self.renovar_si_toca().await?;
        let token = self.token().await?;
        let r = self
            .http
            .get(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .send()
            .await
            .map_err(red)?;
        if !r.status().is_success() {
            return Err(Error::Servidor(r.status().to_string()));
        }
        Ok(r.bytes().await.map_err(red)?.to_vec())
    }

    /// Tamaño de un archivo grande sin descargarlo (`Range: bytes=0-0`).
    pub async fn tamano_remoto(&self, ruta: &str) -> Resultado<u64> {
        self.renovar_si_toca().await?;
        let token = self.token().await?;
        let r = self
            .http
            .get(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .header("range", "bytes=0-0")
            .send()
            .await
            .map_err(red)?;
        r.headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit('/').next())
            .and_then(|t| t.parse().ok())
            .ok_or_else(|| Error::Servidor(format!("{} sin Content-Range", r.status())))
    }

    /// Descarga a `destino` (vía `<destino>.part`), informando `progreso(bytes, total)`.
    pub async fn descargar(
        &self,
        ruta: &str,
        destino: &std::path::Path,
        progreso: impl Fn(u64, u64),
    ) -> Resultado<()> {
        use tokio::io::AsyncWriteExt;
        self.renovar_si_toca().await?;
        let token = self.token().await?;
        let mut r = self
            .http
            .get(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .timeout(Duration::from_secs(3600))
            .send()
            .await
            .map_err(red)?;
        if !r.status().is_success() {
            return Err(Error::Servidor(r.status().to_string()));
        }
        let total = r.content_length().unwrap_or(0);
        let parcial = destino.with_extension("part");
        let io = |e: std::io::Error| Error::Servidor(format!("{}: {e}", parcial.display()));
        let mut archivo = tokio::fs::File::create(&parcial).await.map_err(io)?;
        let mut hecho = 0u64;
        while let Some(trozo) = r.chunk().await.map_err(red)? {
            archivo.write_all(&trozo).await.map_err(io)?;
            hecho += trozo.len() as u64;
            progreso(hecho, total);
        }
        archivo.flush().await.map_err(io)?;
        drop(archivo);
        tokio::fs::rename(&parcial, destino).await.map_err(io)
    }

    /// POST con sesión (mismo reintento que `get`).
    pub async fn post<T: DeserializeOwned>(&self, ruta: &str, cuerpo: &Value) -> Resultado<T> {
        self.renovar_si_toca().await?;
        match self.post_una_vez(ruta, cuerpo).await {
            Err(Error::NoAutorizado(_)) => {
                self.renovar().await?;
                self.post_una_vez(ruta, cuerpo).await
            }
            otro => otro,
        }
    }

    /// POST con respuesta NDJSON: `al_recibir` por cada línea (streaming de Cortex).
    pub async fn post_ndjson(
        &self,
        ruta: &str,
        cuerpo: &Value,
        mut al_recibir: impl FnMut(Value),
    ) -> Resultado<()> {
        self.renovar_si_toca().await?;
        let token = self.token().await?;
        let mut r = self
            .http
            .post(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .timeout(Duration::from_secs(300))
            .json(cuerpo)
            .send()
            .await
            .map_err(red)?;
        if !r.status().is_success() {
            return leer::<Value>(r).await.map(|_| ());
        }
        let mut pendiente = Vec::<u8>::new();
        while let Some(trozo) = r.chunk().await.map_err(red)? {
            pendiente.extend_from_slice(&trozo);
            while let Some(fin) = pendiente.iter().position(|&b| b == b'\n') {
                let linea: Vec<u8> = pendiente.drain(..=fin).collect();
                if let Ok(v) = serde_json::from_slice::<Value>(&linea) {
                    al_recibir(v);
                }
            }
        }
        Ok(())
    }

    /// DELETE con sesión.
    pub async fn borrar(&self, ruta: &str) -> Resultado<()> {
        self.renovar_si_toca().await?;
        let token = self.token().await?;
        let r = self
            .http
            .delete(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .send()
            .await
            .map_err(red)?;
        leer::<Value>(r).await.map(|_| ())
    }

    /// Token válido para abrir el WebSocket.
    pub async fn token_vigente(&self) -> Resultado<String> {
        self.renovar_si_toca().await?;
        self.token().await
    }

    async fn post_una_vez<T: DeserializeOwned>(&self, ruta: &str, cuerpo: &Value) -> Resultado<T> {
        let token = self.token().await?;
        let r = self
            .http
            .post(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .json(cuerpo)
            .send()
            .await
            .map_err(red)?;
        leer(r).await
    }

    async fn get_una_vez<T: DeserializeOwned>(&self, ruta: &str) -> Resultado<T> {
        let token = self.token().await?;
        let r = self
            .http
            .get(format!("{}{ruta}", self.base))
            .bearer_auth(token)
            .send()
            .await
            .map_err(red)?;
        leer(r).await
    }

    async fn token(&self) -> Resultado<String> {
        self.sesion
            .read()
            .await
            .as_ref()
            .map(|s| s.tokens.access_token.clone())
            .ok_or_else(|| Error::NoAutorizado("sin sesión".into()))
    }

    async fn renovar_si_toca(&self) -> Resultado<()> {
        let toca = matches!(
            &*self.sesion.read().await,
            Some(s) if s.caduca.saturating_duration_since(Instant::now()) < Duration::from_secs(60)
        );
        if toca { self.renovar().await } else { Ok(()) }
    }

    async fn renovar(&self) -> Resultado<()> {
        let refresh = self
            .sesion
            .read()
            .await
            .as_ref()
            .map(|s| s.tokens.refresh_token.clone())
            .ok_or_else(|| Error::NoAutorizado("sin sesión".into()))?;
        let cuerpo = json!({ "refresh_token": refresh });
        match self
            .publicar_sin_sesion::<Tokens>("/v1/sesion/renovar", &cuerpo)
            .await
        {
            Ok(t) => {
                self.guardar(t).await;
                Ok(())
            }
            Err(e @ Error::NoAutorizado(_)) => {
                *self.sesion.write().await = None;
                Err(e)
            }
            Err(e) => Err(e),
        }
    }

    async fn guardar(&self, tokens: Tokens) {
        if let Some(f) = self.al_renovar.lock().expect("al_renovar").as_ref() {
            f(&tokens);
        }
        let caduca = Instant::now() + Duration::from_secs(tokens.expires_in.max(60) as u64);
        *self.sesion.write().await = Some(Sesion { tokens, caduca });
    }

    async fn publicar_sin_sesion<T: DeserializeOwned>(
        &self,
        ruta: &str,
        cuerpo: &Value,
    ) -> Resultado<T> {
        let r = self
            .http
            .post(format!("{}{ruta}", self.base))
            .json(cuerpo)
            .send()
            .await
            .map_err(red)?;
        leer(r).await
    }
}

fn red(e: reqwest::Error) -> Error {
    Error::Red(if e.is_timeout() {
        "tiempo agotado".into()
    } else if e.is_connect() {
        "no responde".into()
    } else {
        e.to_string()
    })
}

/// Errores de la API: `{"error": "<codigo>", "mensaje": "..."}`.
async fn leer<T: DeserializeOwned>(r: reqwest::Response) -> Resultado<T> {
    let estado = r.status();
    if estado == StatusCode::NO_CONTENT {
        return serde_json::from_value(Value::Null)
            .map_err(|e| Error::Servidor(format!("respuesta vacía: {e}")));
    }
    if estado.is_success() {
        return r
            .json()
            .await
            .map_err(|e| Error::Servidor(format!("respuesta inválida: {e}")));
    }
    let v: Value = r.json().await.unwrap_or_default();
    let mensaje = v["mensaje"].as_str().unwrap_or("").to_owned();
    if estado == StatusCode::UNAUTHORIZED {
        Err(Error::NoAutorizado(if mensaje.is_empty() {
            "sesión caducada".into()
        } else {
            mensaje
        }))
    } else {
        Err(Error::Servidor(format!("{estado}: {mensaje}")))
    }
}
