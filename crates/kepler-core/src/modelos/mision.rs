use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::sincronizable;
use crate::{Coordenada, Dificultad, Error, EstadoMision, Meta, Resultado, TipoTerreno, nuevo_id};

/// `misiones`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Mision {
    pub id: Uuid,
    pub user_id: Uuid,
    pub ruta_id: Option<Uuid>,
    pub codigo: String,
    pub titulo: Option<String>,
    pub objetivo: Option<String>,
    #[serde(default)]
    pub estado: EstadoMision,
    pub zona: Option<String>,
    pub descripcion_ia: Option<String>,
    pub tipo_terreno: Option<TipoTerreno>,
    pub dificultad: Option<Dificultad>,
    #[serde(default)]
    pub clima: Value,
    pub lat_inicio: Option<f64>,
    pub lng_inicio: Option<f64>,
    pub inicio_en: Option<DateTime<Utc>>,
    pub fin_en: Option<DateTime<Utc>>,
    #[serde(default)]
    pub distancia_m: f64,
    #[serde(default)]
    pub duracion_s: i32,
    #[serde(default)]
    pub vel_max_mps: f64,
    #[serde(flatten)]
    pub meta: Meta,
}

sincronizable!(Mision, "misiones");

impl Mision {
    /// Misión planificada con código `MISION-AAAAMMDDHHmm`.
    pub fn nueva(user_id: Uuid, ahora: DateTime<Utc>) -> Self {
        Self {
            id: nuevo_id(),
            user_id,
            ruta_id: None,
            codigo: Self::codigo_para(ahora),
            titulo: None,
            objetivo: None,
            estado: EstadoMision::Planificada,
            zona: None,
            descripcion_ia: None,
            tipo_terreno: None,
            dificultad: None,
            clima: Value::Object(Default::default()),
            lat_inicio: None,
            lng_inicio: None,
            inicio_en: None,
            fin_en: None,
            distancia_m: 0.0,
            duracion_s: 0,
            vel_max_mps: 0.0,
            meta: Meta::nueva(ahora),
        }
    }

    pub fn codigo_para(momento: DateTime<Utc>) -> String {
        momento.format("MISION-%Y%m%d%H%M").to_string()
    }

    /// Despegue: pasa a activa y fija el punto de inicio.
    pub fn iniciar(&mut self, ahora: DateTime<Utc>, inicio: Option<Coordenada>) -> Resultado<()> {
        self.cambiar_estado(EstadoMision::Activa, ahora)?;
        self.inicio_en = Some(ahora);
        if let Some(c) = inicio {
            self.lat_inicio = Some(c.lat);
            self.lng_inicio = Some(c.lng);
        }
        Ok(())
    }

    /// Cierre normal con el resumen del rastro GPS.
    pub fn completar(&mut self, ahora: DateTime<Utc>, resumen: &ResumenRastro) -> Resultado<()> {
        self.cambiar_estado(EstadoMision::Completada, ahora)?;
        self.fin_en = Some(ahora);
        self.distancia_m = resumen.distancia_m;
        self.duracion_s = resumen.duracion_s;
        self.vel_max_mps = resumen.vel_max_mps;
        Ok(())
    }

    pub fn abortar(&mut self, ahora: DateTime<Utc>) -> Resultado<()> {
        self.cambiar_estado(EstadoMision::Abortada, ahora)?;
        self.fin_en = Some(ahora);
        Ok(())
    }

    fn cambiar_estado(&mut self, hacia: EstadoMision, ahora: DateTime<Utc>) -> Resultado<()> {
        if !self.estado.puede_pasar_a(hacia) {
            return Err(Error::TransicionInvalida {
                desde: self.estado.como_str(),
                hacia: hacia.como_str(),
            });
        }
        self.estado = hacia;
        self.meta.tocar(ahora);
        Ok(())
    }
}

/// `rastro_gps`: un punto del recorrido (solo inserción).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PuntoRastro {
    pub id: Uuid,
    pub user_id: Uuid,
    pub mision_id: Uuid,
    pub lat: f64,
    pub lng: f64,
    pub altitud: Option<f64>,
    /// m/s, según el GPS.
    pub velocidad: Option<f64>,
    pub rumbo: Option<f64>,
    pub precision_m: Option<f64>,
    pub registrado_en: DateTime<Utc>,
    pub creado_en: DateTime<Utc>,
}

/// Distancia, duración y velocidad máxima de un rastro.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct ResumenRastro {
    pub distancia_m: f64,
    pub duracion_s: i32,
    pub vel_max_mps: f64,
    pub puntos_validos: usize,
}

impl ResumenRastro {
    /// Puntos con precisión peor que esta se descartan (saltos del GPS).
    pub const PRECISION_MAX_M: f64 = 50.0;
    /// Velocidad por encima de la cual un tramo se considera error (≈ 216 km/h).
    pub const VELOCIDAD_MAX_PLAUSIBLE_MPS: f64 = 60.0;

    pub fn calcular(puntos: &[PuntoRastro]) -> Self {
        let mut validos: Vec<&PuntoRastro> = puntos
            .iter()
            .filter(|p| p.precision_m.is_none_or(|m| m <= Self::PRECISION_MAX_M))
            .filter(|p| Coordenada::new(p.lat, p.lng).is_ok())
            .collect();
        validos.sort_by_key(|p| p.registrado_en);

        let mut resumen = Self {
            puntos_validos: validos.len(),
            ..Self::default()
        };
        let (Some(primero), Some(ultimo)) = (validos.first(), validos.last()) else {
            return resumen;
        };
        resumen.duracion_s =
            i32::try_from((ultimo.registrado_en - primero.registrado_en).num_seconds())
                .unwrap_or(i32::MAX);

        for par in validos.windows(2) {
            let (a, b) = (par[0], par[1]);
            let tramo = Coordenada {
                lat: a.lat,
                lng: a.lng,
            }
            .distancia_m(&Coordenada {
                lat: b.lat,
                lng: b.lng,
            });
            let dt = (b.registrado_en - a.registrado_en).num_milliseconds() as f64 / 1000.0;
            let vel_tramo = if dt > 0.0 { tramo / dt } else { 0.0 };
            if vel_tramo > Self::VELOCIDAD_MAX_PLAUSIBLE_MPS {
                continue;
            }
            resumen.distancia_m += tramo;
            let vel = b.velocidad.unwrap_or(vel_tramo);
            if vel <= Self::VELOCIDAD_MAX_PLAUSIBLE_MPS {
                resumen.vel_max_mps = resumen.vel_max_mps.max(vel);
            }
        }
        resumen
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, TimeZone};

    use super::*;

    fn t0() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 31, 20, 5, 0).unwrap()
    }

    fn punto(seg: i64, lat: f64, lng: f64, precision: Option<f64>) -> PuntoRastro {
        PuntoRastro {
            id: nuevo_id(),
            user_id: Uuid::nil(),
            mision_id: Uuid::nil(),
            lat,
            lng,
            altitud: None,
            velocidad: None,
            rumbo: None,
            precision_m: precision,
            registrado_en: t0() + Duration::seconds(seg),
            creado_en: t0(),
        }
    }

    #[test]
    fn ciclo_de_vida() {
        let mut m = Mision::nueva(Uuid::nil(), t0());
        assert_eq!(m.codigo, "MISION-202610312005");
        assert!(m.completar(t0(), &ResumenRastro::default()).is_err());

        let inicio = Coordenada::new(10.48, -66.90).unwrap();
        m.iniciar(t0(), Some(inicio)).unwrap();
        assert_eq!((m.estado, m.meta.version), (EstadoMision::Activa, 2));

        let resumen = ResumenRastro {
            distancia_m: 1500.0,
            duracion_s: 900,
            vel_max_mps: 2.0,
            puntos_validos: 90,
        };
        m.completar(t0() + Duration::minutes(15), &resumen).unwrap();
        assert_eq!(m.estado, EstadoMision::Completada);
        assert_eq!(m.distancia_m, 1500.0);
        assert!(m.abortar(t0()).is_err());
    }

    #[test]
    fn serializa_como_fila_de_postgrest() {
        let m = Mision::nueva(Uuid::nil(), t0());
        let json = serde_json::to_value(&m).unwrap();
        assert_eq!(json["estado"], "planificada");
        assert_eq!(json["version"], 1);
        assert!(json.get("meta").is_none(), "meta va aplanado");
        let vuelta: Mision = serde_json::from_value(json).unwrap();
        assert_eq!(vuelta, m);
    }

    #[test]
    fn resumen_de_rastro() {
        // ~111 m por cada 0.001° de latitud, cada 60 s
        let puntos = vec![
            punto(120, 10.002, -66.9, Some(5.0)),
            punto(0, 10.000, -66.9, Some(5.0)),
            punto(60, 10.001, -66.9, Some(5.0)),
            punto(90, 11.000, -66.9, Some(500.0)), // impreciso: se descarta
        ];
        let r = ResumenRastro::calcular(&puntos);
        assert_eq!(r.puntos_validos, 3);
        assert_eq!(r.duracion_s, 120);
        assert!((r.distancia_m - 222.4).abs() < 1.0, "{}", r.distancia_m);
        assert!((r.vel_max_mps - 1.853).abs() < 0.01, "{}", r.vel_max_mps);
    }

    #[test]
    fn resumen_descarta_saltos_imposibles() {
        let puntos = vec![
            punto(0, 10.0, -66.9, None),
            punto(1, 10.5, -66.9, None), // 55 km en 1 s
            punto(2, 10.0, -66.9, None),
        ];
        let r = ResumenRastro::calcular(&puntos);
        assert_eq!(r.distancia_m, 0.0);
        assert_eq!(r.vel_max_mps, 0.0);
        assert!(ResumenRastro::calcular(&[]).puntos_validos == 0);
    }
}
