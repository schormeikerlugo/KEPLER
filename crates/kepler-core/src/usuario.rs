//! Cuentas por nombre de usuario.
//!
//! Auth (GoTrue) exige un email; KEPLER usa uno interno, `<usuario>@kepler.local`,
//! que nunca se muestra ni recibe correos. Todas las apps inician sesión con
//! [`NombreUsuario::email_interno`].

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::{Error, Resultado};

pub const DOMINIO_INTERNO: &str = "kepler.local";

/// Nombre de usuario validado: 3-30 caracteres `[a-z0-9_]`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct NombreUsuario(String);

impl NombreUsuario {
    /// Valida un nombre ya normalizado.
    pub fn new(nombre: impl Into<String>) -> Resultado<Self> {
        let nombre = nombre.into();
        let valido = (3..=30).contains(&nombre.len())
            && nombre
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_');
        if valido {
            Ok(Self(nombre))
        } else {
            Err(Error::UsuarioInvalido)
        }
    }

    /// Acepta lo que escribe la persona en el login: recorta espacios y pasa a minúsculas.
    pub fn desde_entrada(entrada: &str) -> Resultado<Self> {
        Self::new(entrada.trim().to_lowercase())
    }

    /// Recupera el usuario a partir del email interno de Auth.
    pub fn desde_email_interno(email: &str) -> Resultado<Self> {
        match email.split_once('@') {
            Some((usuario, dominio)) if dominio == DOMINIO_INTERNO => Self::new(usuario),
            _ => Err(Error::UsuarioInvalido),
        }
    }

    pub fn email_interno(&self) -> String {
        format!("{}@{DOMINIO_INTERNO}", self.0)
    }

    pub fn como_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for NombreUsuario {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl FromStr for NombreUsuario {
    type Err = Error;

    fn from_str(s: &str) -> Resultado<Self> {
        Self::new(s)
    }
}

impl TryFrom<String> for NombreUsuario {
    type Error = Error;

    fn try_from(s: String) -> Resultado<Self> {
        Self::new(s)
    }
}

impl From<NombreUsuario> for String {
    fn from(n: NombreUsuario) -> Self {
        n.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valida_formato() {
        assert!(NombreUsuario::new("lenovics").is_ok());
        assert!(NombreUsuario::new("explorador_73").is_ok());
        assert!(NombreUsuario::new("ab").is_err());
        assert!(NombreUsuario::new("Lenovics").is_err());
        assert!(NombreUsuario::new("con espacio").is_err());
        assert!(NombreUsuario::new("ñandú").is_err());
        assert!(NombreUsuario::new("a".repeat(31)).is_err());
    }

    #[test]
    fn normaliza_la_entrada_del_login() {
        let u = NombreUsuario::desde_entrada("  Lenovics ").unwrap();
        assert_eq!(u.como_str(), "lenovics");
        assert_eq!(u.email_interno(), "lenovics@kepler.local");
    }

    #[test]
    fn email_interno_ida_y_vuelta() {
        let u = NombreUsuario::desde_email_interno("lenovics@kepler.local").unwrap();
        assert_eq!(u.como_str(), "lenovics");
        assert!(NombreUsuario::desde_email_interno("lenovics@gmail.com").is_err());
    }

    #[test]
    fn serde_valida_al_deserializar() {
        assert!(serde_json::from_str::<NombreUsuario>("\"lenovics\"").is_ok());
        assert!(serde_json::from_str::<NombreUsuario>("\"NO VALE\"").is_err());
    }
}
