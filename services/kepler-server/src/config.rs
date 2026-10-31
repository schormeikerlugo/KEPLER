use std::net::SocketAddr;

/// Configuración desde variables de entorno (ver `infra/.env.example`).
#[derive(Debug, Clone)]
pub struct Config {
    pub direccion: SocketAddr,
    /// Conexión como rol `authenticator`: solo puede asumir `authenticated` (RLS).
    pub database_url: String,
    pub jwt_secret: String,
    /// Servidores Ollama en orden de preferencia (PC → Mac mini).
    pub ollama_urls: Vec<String>,
    pub ollama_modelo: String,
    /// Orígenes web permitidos (CORS). Vacío = ninguno; las apps nativas no lo necesitan.
    pub cors_origenes: Vec<String>,
    pub peticiones_por_segundo: u64,
    pub rafaga: u32,
}

#[derive(Debug, thiserror::Error)]
#[error("falta la variable de entorno {0}")]
pub struct FaltaVariable(&'static str);

impl Config {
    pub fn desde_entorno() -> Result<Self, FaltaVariable> {
        let requerida = |k: &'static str| std::env::var(k).map_err(|_| FaltaVariable(k));
        let opcional = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_owned());
        let lista = |k: &str| {
            std::env::var(k)
                .unwrap_or_default()
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        };

        Ok(Self {
            direccion: opcional("KEPLER_DIRECCION", "0.0.0.0:8000")
                .parse()
                .map_err(|_| FaltaVariable("KEPLER_DIRECCION (ip:puerto)"))?,
            database_url: requerida("KEPLER_DATABASE_URL")?,
            jwt_secret: requerida("KEPLER_JWT_SECRET")?,
            ollama_urls: lista("KEPLER_OLLAMA_URLS"),
            ollama_modelo: opcional("KEPLER_OLLAMA_MODELO", "mistral:7b"),
            cors_origenes: lista("KEPLER_CORS_ORIGENES"),
            peticiones_por_segundo: opcional("KEPLER_RPS", "20").parse().unwrap_or(20),
            rafaga: opcional("KEPLER_RAFAGA", "60").parse().unwrap_or(60),
        })
    }
}
