//! Enumeraciones de dominio. Los textos coinciden exactamente con los `check`
//! de `infra/migrations`, así que (de)serializan directo desde la base de datos.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::Error;

macro_rules! enum_texto {
    (
        $(#[$meta:meta])*
        $nombre:ident { $($(#[$vmeta:meta])* $variante:ident => $texto:literal),+ $(,)? }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        pub enum $nombre {
            $($(#[$vmeta])* #[serde(rename = $texto)] $variante),+
        }

        impl $nombre {
            pub const TODOS: &'static [Self] = &[$(Self::$variante),+];

            pub const fn como_str(self) -> &'static str {
                match self {
                    $(Self::$variante => $texto),+
                }
            }
        }

        impl fmt::Display for $nombre {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(self.como_str())
            }
        }

        impl FromStr for $nombre {
            type Err = Error;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                match s {
                    $($texto => Ok(Self::$variante),)+
                    otro => Err(Error::ValorDesconocido {
                        tipo: stringify!($nombre),
                        valor: otro.to_owned(),
                    }),
                }
            }
        }
    };
}

enum_texto! {
    /// Rol del explorador en el sistema.
    #[derive(Default)]
    Rol { #[default] Explorador => "explorador", Comandante => "comandante" }
}

enum_texto! {
    /// Ciclo de vida de una misión.
    #[derive(Default)]
    EstadoMision {
        #[default] Planificada => "planificada",
        Activa => "activa",
        Completada => "completada",
        Abortada => "abortada",
    }
}

enum_texto! {
    TipoTerreno {
        Llano => "llano",
        Asfalto => "asfalto",
        Tierra => "tierra",
        Barro => "barro",
        Rocoso => "rocoso",
        Montana => "montana",
    }
}

enum_texto! {
    Dificultad { Baja => "baja", Moderada => "moderada", Alta => "alta" }
}

enum_texto! {
    /// Una ruta se planifica antes de salir o se registra en campo.
    OrigenRuta { Planificada => "planificada", Registrada => "registrada" }
}

enum_texto! {
    #[derive(Default)]
    Seguridad {
        Seguro => "seguro",
        Precaucion => "precaucion",
        Peligro => "peligro",
        #[default] Desconocido => "desconocido",
    }
}

enum_texto! {
    #[derive(Default)]
    Hostilidad {
        Aliado => "aliado",
        Neutral => "neutral",
        Hostil => "hostil",
        #[default] Desconocido => "desconocido",
    }
}

enum_texto! {
    #[derive(Default)]
    NivelRiesgo { Bajo => "bajo", #[default] Medio => "medio", Alto => "alto", Critico => "critico" }
}

enum_texto! {
    #[derive(Default)]
    EstadoPoi { #[default] Activo => "activo", Verificado => "verificado", Inactivo => "inactivo" }
}

enum_texto! {
    #[derive(Default)]
    TipoNotificacion {
        Critical => "critical",
        Warning => "warning",
        Success => "success",
        #[default] Info => "info",
    }
}

enum_texto! {
    /// Tipos de hallazgo con Re-ID visual (`buscar_similares`).
    Entidad { Persona => "persona", Poi => "poi", Objeto => "objeto" }
}

enum_texto! {
    RolChat { Usuario => "user", Asistente => "assistant" }
}

impl EstadoMision {
    /// Transiciones válidas: planificada → activa → completada, y abortar
    /// desde planificada o activa. Los estados finales no cambian.
    pub const fn puede_pasar_a(self, hacia: Self) -> bool {
        matches!(
            (self, hacia),
            (Self::Planificada, Self::Activa)
                | (Self::Activa, Self::Completada)
                | (Self::Planificada | Self::Activa, Self::Abortada)
        )
    }

    pub const fn es_final(self) -> bool {
        matches!(self, Self::Completada | Self::Abortada)
    }
}

impl NivelRiesgo {
    /// Riesgos que generan alerta en el dashboard.
    pub const fn requiere_alerta(self) -> bool {
        matches!(self, Self::Alto | Self::Critico)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn texto_ida_y_vuelta() {
        for e in EstadoMision::TODOS {
            assert_eq!(e.como_str().parse::<EstadoMision>().unwrap(), *e);
        }
        assert_eq!(TipoTerreno::Montana.to_string(), "montana");
        assert!("volando".parse::<EstadoMision>().is_err());
    }

    #[test]
    fn serde_usa_los_textos_de_la_base() {
        assert_eq!(
            serde_json::to_string(&RolChat::Asistente).unwrap(),
            "\"assistant\""
        );
        let h: Hostilidad = serde_json::from_str("\"hostil\"").unwrap();
        assert_eq!(h, Hostilidad::Hostil);
    }

    #[test]
    fn transiciones_de_mision() {
        use EstadoMision::*;
        assert!(Planificada.puede_pasar_a(Activa));
        assert!(Activa.puede_pasar_a(Completada));
        assert!(Activa.puede_pasar_a(Abortada));
        assert!(Planificada.puede_pasar_a(Abortada));
        assert!(!Planificada.puede_pasar_a(Completada));
        assert!(!Completada.puede_pasar_a(Activa));
        assert!(Abortada.es_final());
    }
}
