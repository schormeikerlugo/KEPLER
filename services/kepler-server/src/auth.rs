//! Autenticación con los JWT que emite Supabase Auth (HS256, `JWT_SECRET`).

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::ApiError;
use crate::estado::Estado;

#[derive(Debug, Clone, Deserialize)]
struct Claims {
    sub: Uuid,
    role: String,
}

/// Usuario autenticado de la petición.
#[derive(Debug, Clone)]
pub struct Sesion {
    pub user_id: Uuid,
    /// Claims tal cual, para `request.jwt.claims` (lo que lee `auth.uid()` en RLS).
    pub claims_json: String,
}

#[derive(Clone)]
pub struct Verificador {
    clave: DecodingKey,
    validacion: Validation,
}

impl Verificador {
    pub fn new(secreto: &str) -> Self {
        let mut validacion = Validation::new(Algorithm::HS256);
        validacion.set_audience(&["authenticated"]);
        validacion.set_required_spec_claims(&["exp", "sub", "aud"]);
        validacion.leeway = 30;
        Self {
            clave: DecodingKey::from_secret(secreto.as_bytes()),
            validacion,
        }
    }

    pub fn verificar(&self, token: &str) -> Result<Sesion, ApiError> {
        let datos = decode::<serde_json::Value>(token, &self.clave, &self.validacion)
            .map_err(|_| ApiError::NoAutorizado("token inválido o expirado"))?;
        let claims: Claims = serde_json::from_value(datos.claims.clone())
            .map_err(|_| ApiError::NoAutorizado("token sin usuario"))?;
        if claims.role != "authenticated" {
            return Err(ApiError::NoAutorizado("se requiere una sesión de usuario"));
        }
        Ok(Sesion {
            user_id: claims.sub,
            claims_json: datos.claims.to_string(),
        })
    }
}

fn token_bearer(parts: &Parts) -> Option<&str> {
    parts
        .headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
}

impl FromRequestParts<Estado> for Sesion {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        estado: &Estado,
    ) -> Result<Self, Self::Rejection> {
        let token =
            token_bearer(parts).ok_or(ApiError::NoAutorizado("falta Authorization: Bearer"))?;
        estado.verificador.verificar(token)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde_json::json;

    use super::*;

    pub const SECRETO: &str = "secreto-de-prueba-de-al-menos-32-caracteres";

    pub fn token(claims: serde_json::Value, secreto: &str) -> String {
        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secreto.as_bytes()),
        )
        .unwrap()
    }

    pub fn claims_validos(sub: Uuid) -> serde_json::Value {
        let exp = chrono::Utc::now().timestamp() + 3600;
        json!({ "sub": sub, "role": "authenticated", "aud": "authenticated", "exp": exp,
                "email": "lenovics@kepler.local" })
    }

    #[test]
    fn acepta_token_valido() {
        let id = Uuid::now_v7();
        let s = Verificador::new(SECRETO)
            .verificar(&token(claims_validos(id), SECRETO))
            .unwrap();
        assert_eq!(s.user_id, id);
        assert!(s.claims_json.contains("authenticated"));
    }

    #[test]
    fn rechaza_tokens_incorrectos() {
        let v = Verificador::new(SECRETO);
        let id = Uuid::now_v7();

        assert!(
            v.verificar(&token(
                claims_validos(id),
                "otro-secreto-distinto-de-32-caracteres"
            ))
            .is_err()
        );

        let mut expirado = claims_validos(id);
        expirado["exp"] = json!(chrono::Utc::now().timestamp() - 3600);
        assert!(v.verificar(&token(expirado, SECRETO)).is_err());

        let mut anon = claims_validos(id);
        anon["role"] = json!("anon");
        assert!(v.verificar(&token(anon, SECRETO)).is_err());

        let mut otra_aud = claims_validos(id);
        otra_aud["aud"] = json!("otra");
        assert!(v.verificar(&token(otra_aud, SECRETO)).is_err());

        // La clave service_role tampoco sirve como sesión de usuario
        let servicio = json!({ "role": "service_role", "iss": "supabase",
                               "exp": chrono::Utc::now().timestamp() + 3600 });
        assert!(v.verificar(&token(servicio, SECRETO)).is_err());

        assert!(v.verificar("no-es-un-jwt").is_err());
    }
}
