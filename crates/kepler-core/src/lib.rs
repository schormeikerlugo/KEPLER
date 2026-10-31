//! Núcleo de dominio de KEPLER.
//!
//! Los modelos se definen en el paso 3 del roadmap, a partir del esquema
//! limpio de `infra/migrations`.

/// Versión del núcleo, compartida por todos los binarios del workspace.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_workspace() {
        assert_eq!(VERSION, "0.8.0");
    }
}
