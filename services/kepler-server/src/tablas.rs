//! Tablas que participan en la sincronización offline (lista cerrada).

use kepler_core::modelos::{
    ChatSesion, Confirmacion, Mision, Notificacion, Objeto, Persona, PuntoInteres, PuntoRastro,
    Ruta,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Tabla {
    Rutas,
    Misiones,
    RastroGps,
    Objetos,
    Personas,
    PuntosInteres,
    Notificaciones,
    ChatSesiones,
    Confirmaciones,
}

impl Tabla {
    /// En orden de dependencias: rutas antes que misiones, misiones antes que hallazgos.
    pub const TODAS: &'static [Self] = &[
        Self::Rutas,
        Self::Misiones,
        Self::RastroGps,
        Self::Objetos,
        Self::Personas,
        Self::PuntosInteres,
        Self::Notificaciones,
        Self::ChatSesiones,
        // Después de los hallazgos: puede confirmar uno subido en el mismo lote.
        Self::Confirmaciones,
    ];

    pub const fn nombre(self) -> &'static str {
        match self {
            Self::Rutas => "rutas",
            Self::Misiones => "misiones",
            Self::RastroGps => "rastro_gps",
            Self::Objetos => "objetos",
            Self::Personas => "personas",
            Self::PuntosInteres => "puntos_interes",
            Self::Notificaciones => "notificaciones",
            Self::ChatSesiones => "chat_sesiones",
            Self::Confirmaciones => "confirmaciones",
        }
    }

    pub fn desde_nombre(nombre: &str) -> Option<Self> {
        Self::TODAS.iter().copied().find(|t| t.nombre() == nombre)
    }

    /// Columna que marca "cambió en el servidor". La fija siempre el servidor
    /// (`now()`), nunca el reloj del dispositivo, para que el cursor sea fiable.
    pub const fn columna_cursor(self) -> &'static str {
        match self {
            Self::RastroGps | Self::Confirmaciones => "creado_en",
            _ => "actualizado_en",
        }
    }

    pub const fn solo_insercion(self) -> bool {
        matches!(self, Self::RastroGps | Self::Confirmaciones)
    }

    pub const fn tiene_embedding(self) -> bool {
        matches!(self, Self::Objetos | Self::Personas | Self::PuntosInteres)
    }

    /// Valida una fila del cliente contra el modelo de `kepler-core`, fija su
    /// dueño y la devuelve normalizada. Devuelve también su id.
    pub fn validar(self, fila: Value, user_id: Uuid) -> ApiResult<(Uuid, Value)> {
        fn via<T: DeserializeOwned + Serialize>(
            mut fila: Value,
            user_id: Uuid,
        ) -> ApiResult<(Uuid, Value)> {
            if let Some(obj) = fila.as_object_mut() {
                obj.insert("user_id".into(), Value::String(user_id.to_string()));
            }
            let modelo: T = serde_json::from_value(fila)?;
            let v = serde_json::to_value(&modelo)?;
            let id = v["id"]
                .as_str()
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| ApiError::Invalido("fila sin id".into()))?;
            Ok((id, v))
        }

        match self {
            Self::Rutas => via::<Ruta>(fila, user_id),
            Self::Misiones => via::<Mision>(fila, user_id),
            Self::RastroGps => via::<PuntoRastro>(fila, user_id),
            Self::Objetos => via::<Objeto>(fila, user_id),
            Self::Personas => via::<Persona>(fila, user_id),
            Self::PuntosInteres => via::<PuntoInteres>(fila, user_id),
            Self::Notificaciones => via::<Notificacion>(fila, user_id),
            Self::ChatSesiones => via::<ChatSesion>(fila, user_id),
            Self::Confirmaciones => via::<Confirmacion>(fila, user_id),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn nombres_ida_y_vuelta() {
        for t in Tabla::TODAS {
            assert_eq!(Tabla::desde_nombre(t.nombre()), Some(*t));
        }
        assert_eq!(Tabla::desde_nombre("perfiles"), None);
        assert_eq!(Tabla::desde_nombre("misiones; drop table x"), None);
    }

    #[test]
    fn validar_fija_el_dueno_y_rechaza_basura() {
        let yo = Uuid::now_v7();
        let otro = Uuid::now_v7();
        let fila = json!({
            "id": Uuid::now_v7(), "user_id": otro, "mensaje": "hola", "tipo": "info",
            "creado_en": "2026-10-31T20:00:00Z", "actualizado_en": "2026-10-31T20:00:00Z",
            "version": 1
        });
        let (_, v) = Tabla::Notificaciones.validar(fila, yo).unwrap();
        assert_eq!(v["user_id"], json!(yo));

        let mala = json!({ "id": Uuid::now_v7(), "mensaje": "x", "tipo": "pánico" });
        assert!(Tabla::Notificaciones.validar(mala, yo).is_err());
    }
}
