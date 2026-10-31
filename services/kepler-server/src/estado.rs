use std::sync::Arc;

use crate::auth::Verificador;
use crate::config::Config;
use crate::db::Db;
use crate::difusor::Difusor;

/// Estado compartido por todas las peticiones.
#[derive(Clone)]
pub struct Estado(Arc<Interno>);

pub struct Interno {
    pub config: Config,
    pub db: Db,
    pub verificador: Verificador,
    pub difusor: Difusor,
    pub http: reqwest::Client,
}

impl Estado {
    pub fn new(config: Config, db: Db) -> Self {
        let verificador = Verificador::new(&config.jwt_secret);
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("cliente HTTP");
        Self(Arc::new(Interno {
            config,
            db,
            verificador,
            difusor: Difusor::default(),
            http,
        }))
    }
}

impl std::ops::Deref for Estado {
    type Target = Interno;

    fn deref(&self) -> &Interno {
        &self.0
    }
}
