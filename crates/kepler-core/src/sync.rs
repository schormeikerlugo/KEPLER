//! Metadatos de sincronización offline-first.
//!
//! Cada fila sincronizable lleva `version`, que la base de datos incrementa en
//! cada UPDATE. Regla de conflicto: gana la versión más alta; a igual versión,
//! la edición más reciente; si empatan, el servidor.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Meta {
    pub creado_en: DateTime<Utc>,
    pub actualizado_en: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eliminado_en: Option<DateTime<Utc>>,
    pub version: i64,
}

impl Meta {
    pub fn nueva(ahora: DateTime<Utc>) -> Self {
        Self {
            creado_en: ahora,
            actualizado_en: ahora,
            eliminado_en: None,
            version: 1,
        }
    }

    pub fn esta_eliminado(&self) -> bool {
        self.eliminado_en.is_some()
    }

    /// Borrado lógico: el registro se conserva para que otros dispositivos se enteren.
    pub fn eliminar(&mut self, ahora: DateTime<Utc>) {
        self.eliminado_en = Some(ahora);
        self.tocar(ahora);
    }

    /// Edición local (offline). En el servidor lo hace el trigger `tocar_registro`.
    pub fn tocar(&mut self, ahora: DateTime<Utc>) {
        self.actualizado_en = ahora;
        self.version += 1;
    }
}

/// Fila de una tabla sincronizable.
pub trait Sincronizable {
    /// Nombre de la tabla en Postgres.
    const TABLA: &'static str;

    fn id(&self) -> Uuid;
    fn meta(&self) -> &Meta;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ganador {
    Local,
    Remoto,
}

pub fn resolver_conflicto(local: &Meta, remoto: &Meta) -> Ganador {
    match local.version.cmp(&remoto.version) {
        std::cmp::Ordering::Greater => Ganador::Local,
        std::cmp::Ordering::Less => Ganador::Remoto,
        std::cmp::Ordering::Equal if local.actualizado_en > remoto.actualizado_en => Ganador::Local,
        std::cmp::Ordering::Equal => Ganador::Remoto,
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn t(seg: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_800_000_000 + seg, 0).unwrap()
    }

    #[test]
    fn tocar_y_eliminar_suben_version() {
        let mut m = Meta::nueva(t(0));
        m.tocar(t(5));
        assert_eq!((m.version, m.actualizado_en), (2, t(5)));
        m.eliminar(t(9));
        assert!(m.esta_eliminado());
        assert_eq!(m.version, 3);
    }

    #[test]
    fn regla_de_conflicto() {
        let mut local = Meta::nueva(t(0));
        let mut remoto = Meta::nueva(t(0));
        assert_eq!(resolver_conflicto(&local, &remoto), Ganador::Remoto);

        local.tocar(t(10));
        assert_eq!(resolver_conflicto(&local, &remoto), Ganador::Local);

        remoto.tocar(t(20));
        remoto.tocar(t(21));
        assert_eq!(resolver_conflicto(&local, &remoto), Ganador::Remoto);

        let mut a = Meta::nueva(t(0));
        let mut b = Meta::nueva(t(0));
        a.tocar(t(30));
        b.tocar(t(25));
        assert_eq!(resolver_conflicto(&a, &b), Ganador::Local);
    }
}
