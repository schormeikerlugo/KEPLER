//! Núcleo de dominio de KEPLER.
//!
//! Modelos y reglas compartidos por `kepler-server`, el Centro de Control y la
//! Unidad de Campo (iOS vía UniFFI). Sin dependencias de red ni de base de datos.

mod enums;
mod error;
mod geo;
pub mod modelos;
pub mod reid;
mod sync;
mod usuario;
pub mod vector_pg;

pub use enums::{
    Dificultad, Entidad, EstadoMision, EstadoPoi, Hostilidad, NivelRiesgo, OrigenRuta, Rol,
    RolChat, Seguridad, TipoNotificacion, TipoTerreno,
};
pub use error::{Error, Resultado};
pub use geo::{Coordenada, RADIO_TIERRA_M};
pub use sync::{Ganador, Meta, Sincronizable, resolver_conflicto};
pub use usuario::{DOMINIO_INTERNO, NombreUsuario};

/// Versión del núcleo, compartida por todos los binarios del workspace.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Id para un registro nuevo. UUIDv7: se genera en el dispositivo (offline) y
/// es ordenable por tiempo, lo que mantiene compactos los índices.
pub fn nuevo_id() -> uuid::Uuid {
    uuid::Uuid::now_v7()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_workspace() {
        assert_eq!(VERSION, "0.8.0");
    }

    #[test]
    fn ids_ordenados_por_tiempo() {
        let a = nuevo_id();
        let b = nuevo_id();
        assert_eq!(a.get_version_num(), 7);
        assert!(a < b);
    }
}
