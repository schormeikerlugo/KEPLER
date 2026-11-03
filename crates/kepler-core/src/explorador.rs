//! Estado físico del explorador: desgaste del calzado y resistencia.
//!
//! - **Calzado**: kilómetros reales del rastro GPS por el terreno, más las
//!   bajadas (lo que más castiga la suela), desde el último cambio de calzado.
//! - **Resistencia**: modelo de fatiga de Banister. Cada misión deja una carga
//!   (su TRIMP, que ya refleja desnivel e intensidad por el pulso; sin pulso se
//!   estima con distancia, desnivel y clima) que se disipa exponencialmente.
//!   La Preparación del día (sueño, pulso en reposo…) la ajusta.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::TipoTerreno;

/// Constante de tiempo de la fatiga: a las 30 h queda ~37 % de la carga.
pub const TAU_FATIGA_H: f64 = 30.0;
/// Carga residual con la que la resistencia baja a 100·e⁻¹ ≈ 37 %.
pub const ESCALA_FATIGA: f64 = 260.0;
/// Más allá de esto la fatiga de una misión es despreciable (< 0,5 %).
pub const VENTANA_FATIGA_H: i64 = 7 * 24;
/// Sin misiones, se asume un día completo de descanso.
pub const DESCANSO_SIN_MISIONES_H: f64 = 24.0;
/// Resistencia a partir de la que se considera recuperado.
pub const RECUPERADO: f64 = 90.0;

/// Una misión terminada, reducida a lo que importa para el cuerpo y el equipo.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Recorrido {
    pub distancia_km: f64,
    pub terreno: Option<TipoTerreno>,
    pub fin: DateTime<Utc>,
    /// Multiplicador del clima con el que se caminó (1.0 si no se registró).
    pub clima: f64,
    pub desnivel_pos_m: f64,
    pub desnivel_neg_m: f64,
    /// TRIMP de la misión si hubo pulso (ver `fisiologia::trimp`).
    pub carga: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct EstadoFisico {
    /// 0-100, acumulativo desde el último cambio de calzado.
    pub desgaste_calzado: f64,
    /// 0-100: 100 = descansado; baja con la carga reciente.
    pub resistencia: f64,
    pub horas_descanso: f64,
    /// Carga residual de las misiones recientes (unidades de TRIMP).
    pub fatiga: f64,
    /// Horas hasta volver a [`RECUPERADO`] sin nuevas misiones (0 si ya lo está).
    pub recuperacion_h: f64,
}

/// Desgaste del terreno: llano 1×, tierra/barro 1.5×, rocoso/montaña 2.5×.
pub const fn multiplicador_terreno(terreno: Option<TipoTerreno>) -> f64 {
    match terreno {
        Some(TipoTerreno::Llano | TipoTerreno::Asfalto) => 1.0,
        Some(TipoTerreno::Rocoso | TipoTerreno::Montana) => 2.5,
        Some(TipoTerreno::Tierra | TipoTerreno::Barro) | None => 1.5,
    }
}

/// 1 % cada 10 km en llano (× terreno) más 0,5 % por cada 1000 m de bajada; tope 100.
pub fn desgaste_calzado<'a>(recorridos: impl IntoIterator<Item = &'a Recorrido>) -> f64 {
    let total: f64 = recorridos
        .into_iter()
        .map(|r| {
            (r.distancia_km * multiplicador_terreno(r.terreno) + r.desnivel_neg_m / 200.0) / 10.0
        })
        .sum();
    redondear(total.min(100.0))
}

/// Carga de una misión: su TRIMP o, sin pulso, ~12 por km-esfuerzo (100 m de
/// subida ≈ 1 km) con el clima.
pub fn carga(r: &Recorrido) -> f64 {
    r.carga
        .filter(|c| c.is_finite() && *c > 0.0)
        .unwrap_or((r.distancia_km + r.desnivel_pos_m / 100.0) * 12.0 * r.clima)
}

/// Carga residual ahora: Σ carga · e^(−horas/τ).
pub fn fatiga(recorridos: &[Recorrido], ahora: DateTime<Utc>) -> f64 {
    recorridos
        .iter()
        .filter(|r| r.fin <= ahora && ahora - r.fin <= Duration::hours(VENTANA_FATIGA_H))
        .map(|r| {
            let horas = (ahora - r.fin).num_seconds() as f64 / 3600.0;
            carga(r) * (-horas / TAU_FATIGA_H).exp()
        })
        .sum()
}

/// La Preparación del día (0-100) ajusta: ≥ 75 no resta; 0 resta un 20 %.
fn ajuste_preparacion(preparacion: Option<u8>) -> f64 {
    preparacion.map_or(1.0, |p| (0.8 + 0.2 * f64::from(p) / 75.0).min(1.0))
}

/// 100 · e^(−fatiga / escala) · ajuste por la Preparación.
pub fn resistencia(fatiga: f64, preparacion: Option<u8>) -> f64 {
    redondear(
        (100.0 * (-fatiga.max(0.0) / ESCALA_FATIGA).exp() * ajuste_preparacion(preparacion))
            .clamp(0.0, 100.0),
    )
}

/// Calcula el estado a partir de todas las misiones terminadas.
/// `desde_calzado`: solo cuentan para el desgaste las posteriores a esa fecha.
pub fn estado_fisico(
    recorridos: &[Recorrido],
    desde_calzado: Option<DateTime<Utc>>,
    ahora: DateTime<Utc>,
    preparacion: Option<u8>,
) -> EstadoFisico {
    let desgaste = desgaste_calzado(
        recorridos
            .iter()
            .filter(|r| desde_calzado.is_none_or(|d| r.fin >= d)),
    );
    let f = fatiga(recorridos, ahora);
    // Horas hasta que la fatiga baje a lo que corresponde a RECUPERADO (sin el ajuste del día)
    let umbral = ESCALA_FATIGA * (100.0 / RECUPERADO).ln();
    let recuperacion_h = if f > umbral {
        TAU_FATIGA_H * (f / umbral).ln()
    } else {
        0.0
    };
    let horas_descanso = recorridos
        .iter()
        .map(|r| r.fin)
        .filter(|f| *f <= ahora)
        .max()
        .map_or(DESCANSO_SIN_MISIONES_H, |ultimo| {
            ((ahora - ultimo).num_seconds() as f64 / 3600.0).max(0.0)
        });
    EstadoFisico {
        desgaste_calzado: desgaste,
        resistencia: resistencia(f, preparacion),
        horas_descanso: redondear(horas_descanso),
        fatiga: redondear(f),
        recuperacion_h: redondear(recuperacion_h),
    }
}

/// Un decimal, sin «-0».
fn redondear(x: f64) -> f64 {
    (x * 10.0).round() / 10.0 + 0.0
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn ahora() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 31, 20, 0, 0).unwrap()
    }

    fn r(km: f64, terreno: Option<TipoTerreno>, horas_atras: i64, carga: Option<f64>) -> Recorrido {
        Recorrido {
            distancia_km: km,
            terreno,
            fin: ahora() - Duration::hours(horas_atras),
            clima: 1.0,
            desnivel_pos_m: 0.0,
            desnivel_neg_m: 0.0,
            carga,
        }
    }

    #[test]
    fn desgaste_por_terreno_y_bajadas() {
        let rs = [
            r(10.0, Some(TipoTerreno::Llano), 100, None),
            r(10.0, Some(TipoTerreno::Montana), 100, None),
        ];
        assert_eq!(desgaste_calzado(&rs), 3.5);
        let bajada = [Recorrido {
            desnivel_neg_m: 1000.0,
            ..r(10.0, Some(TipoTerreno::Llano), 100, None)
        }];
        assert_eq!(desgaste_calzado(&bajada), 1.5);
        assert_eq!(
            desgaste_calzado(&[r(500.0, Some(TipoTerreno::Rocoso), 100, None)]),
            100.0
        );
        // Sin «-0»
        assert!(desgaste_calzado(&[]).is_sign_positive());
    }

    #[test]
    fn fatiga_que_se_disipa() {
        // Misión dura (TRIMP 315): recién terminada, a las 24 h y a las 48 h
        let r0 = estado_fisico(&[r(14.0, None, 0, Some(315.0))], None, ahora(), None);
        let r24 = estado_fisico(&[r(14.0, None, 24, Some(315.0))], None, ahora(), None);
        let r48 = estado_fisico(&[r(14.0, None, 48, Some(315.0))], None, ahora(), None);
        assert!((25.0..35.0).contains(&r0.resistencia), "{r0:?}");
        assert!((52.0..62.0).contains(&r24.resistencia), "{r24:?}");
        assert!((75.0..83.0).contains(&r48.resistencia), "{r48:?}");
        assert!(r0.recuperacion_h > 70.0 && r48.recuperacion_h < r24.recuperacion_h);
        // Una semana después, recuperado del todo
        assert_eq!(
            estado_fisico(&[r(14.0, None, 24 * 8, Some(315.0))], None, ahora(), None).resistencia,
            100.0
        );
    }

    #[test]
    fn sin_pulso_se_estima_y_la_preparacion_ajusta() {
        // 5 km con 380 m de subida ≈ 105 de carga (como un TRIMP real de ~110)
        let s = Recorrido {
            desnivel_pos_m: 380.0,
            ..r(5.0, None, 0, None)
        };
        assert!((carga(&s) - 105.6).abs() < 0.1);
        let base = estado_fisico(&[s], None, ahora(), None).resistencia;
        assert!(estado_fisico(&[s], None, ahora(), Some(37)).resistencia < base);
        assert_eq!(
            estado_fisico(&[s], None, ahora(), Some(90)).resistencia,
            base
        );
    }

    #[test]
    fn sin_misiones_y_reset_de_calzado() {
        let e = estado_fisico(&[], None, ahora(), None);
        assert_eq!(
            (
                e.desgaste_calzado,
                e.resistencia,
                e.horas_descanso,
                e.recuperacion_h
            ),
            (0.0, 100.0, 24.0, 0.0)
        );
        let rs = [
            r(10.0, Some(TipoTerreno::Llano), 10, None),
            r(10.0, Some(TipoTerreno::Llano), 1, None),
        ];
        let reset = Some(ahora() - Duration::hours(5));
        assert_eq!(
            estado_fisico(&rs, reset, ahora(), None).desgaste_calzado,
            1.0
        );
    }
}
