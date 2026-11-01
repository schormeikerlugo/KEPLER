//! Filas de las tablas de `infra/migrations`. Los nombres de campo coinciden
//! con las columnas, así que (de)serializan directo con PostgREST.
//! Las columnas generadas (`posicion`) no se modelan: las calcula Postgres.

mod catalogos;
mod chat;
mod confirmacion;
mod hallazgos;
mod mision;
mod notificacion;
mod perfil;
mod ruta;

pub use catalogos::{Categoria, PoiCategoria, Subcategoria};
pub use chat::{ChatSesion, MensajeChat};
pub use confirmacion::Confirmacion;
pub use hallazgos::{AlertaPersona, Etiqueta, Objeto, ObjetoEtiqueta, Persona, PuntoInteres};
pub use mision::{Mision, PuntoRastro, ResumenRastro};
pub use notificacion::Notificacion;
pub use perfil::Perfil;
pub use ruta::Ruta;

/// Implementa [`crate::Sincronizable`] para un modelo con `id` y `meta`.
macro_rules! sincronizable {
    ($tipo:ty, $tabla:literal) => {
        impl $crate::Sincronizable for $tipo {
            const TABLA: &'static str = $tabla;

            fn id(&self) -> ::uuid::Uuid {
                self.id
            }

            fn meta(&self) -> &$crate::Meta {
                &self.meta
            }
        }
    };
}

pub(crate) use sincronizable;
