//! Estado físico del explorador: desgaste del calzado y resistencia.
//!
//! Se calcula con la distancia **real** del rastro GPS de cada misión
//! (`misiones.distancia_m`) y su terreno.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::TipoTerreno;

/// Solo las misiones terminadas en esta ventana generan fatiga.
pub const VENTANA_FATIGA_H: i64 = 48;
/// Sin misiones, se asume un día completo de descanso.
pub const DESCANSO_SIN_MISIONES_H: f64 = 24.0;

/// Una misión terminada, reducida a lo que importa para el cuerpo y el equipo.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Recorrido {
    pub distancia_km: f64,
    pub terreno: Option<TipoTerreno>,
    pub fin: DateTime<Utc>,
    /// Multiplicador del clima con el que se caminó (1.0 si no se registró).
    pub clima: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct EstadoFisico {
    /// 0-100, acumulativo desde el último cambio de calzado.
    pub desgaste_calzado: f64,
    /// 0-100, baja al caminar y se recupera descansando.
    pub resistencia: f64,
    pub horas_descanso: f64,
}

/// Desgaste del terreno: llano 1×, tierra/barro 1.5×, rocoso/montaña 2.5×.
pub const fn multiplicador_terreno(terreno: Option<TipoTerreno>) -> f64 {
    match terreno {
        Some(TipoTerreno::Llano | TipoTerreno::Asfalto) => 1.0,
        Some(TipoTerreno::Rocoso | TipoTerreno::Montana) => 2.5,
        Some(TipoTerreno::Tierra | TipoTerreno::Barro) | None => 1.5,
    }
}

/// `min(100, Σ km × terreno / 10)`: 1 % cada 10 km en llano.
pub fn desgaste_calzado<'a>(recorridos: impl IntoIterator<Item = &'a Recorrido>) -> f64 {
    let total: f64 = recorridos
        .into_iter()
        .map(|r| r.distancia_km * multiplicador_terreno(r.terreno) / 10.0)
        .sum();
    redondear(total.min(100.0))
}

/// `clamp(100 − Σ (km / 5 × 2 × clima) + 5 × horas de descanso)`, con la fatiga
/// de las misiones de las últimas [`VENTANA_FATIGA_H`] horas.
pub fn resistencia(recientes: &[Recorrido], horas_descanso: f64) -> f64 {
    let fatiga: f64 = recientes
        .iter()
        .map(|r| r.distancia_km / 5.0 * 2.0 * r.clima)
        .sum();
    redondear((100.0 - fatiga + horas_descanso * 5.0).clamp(0.0, 100.0))
}

/// Calcula el estado a partir de todas las misiones terminadas.
/// `desde_calzado`: solo cuentan para el desgaste las posteriores a esa fecha.
pub fn estado_fisico(
    recorridos: &[Recorrido],
    desde_calzado: Option<DateTime<Utc>>,
    ahora: DateTime<Utc>,
) -> EstadoFisico {
    let desgaste = desgaste_calzado(
        recorridos
            .iter()
            .filter(|r| desde_calzado.is_none_or(|d| r.fin >= d)),
    );

    let corte = ahora - Duration::hours(VENTANA_FATIGA_H);
    let recientes: Vec<Recorrido> = recorridos
        .iter()
        .copied()
        .filter(|r| r.fin >= corte)
        .collect();
    let horas_descanso = recorridos
        .iter()
        .map(|r| r.fin)
        .max()
        .map_or(DESCANSO_SIN_MISIONES_H, |ultimo| {
            ((ahora - ultimo).num_seconds() as f64 / 3600.0).max(0.0)
        });

    EstadoFisico {
        desgaste_calzado: desgaste,
        resistencia: resistencia(&recientes, horas_descanso),
        horas_descanso: redondear(horas_descanso),
    }
}

fn redondear(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn ahora() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 31, 20, 0, 0).unwrap()
    }

    fn r(km: f64, terreno: Option<TipoTerreno>, horas_atras: i64, clima: f64) -> Recorrido {
        Recorrido {
            distancia_km: km,
            terreno,
            fin: ahora() - Duration::hours(horas_atras),
            clima,
        }
    }

    #[test]
    fn desgaste_por_terreno() {
        let rs = [
            r(10.0, Some(TipoTerreno::Llano), 100, 1.0),
            r(10.0, Some(TipoTerreno::Montana), 100, 1.0),
        ];
        assert_eq!(desgaste_calzado(&rs), 3.5);
        let muchos = vec![r(500.0, Some(TipoTerreno::Rocoso), 100, 1.0)];
        assert_eq!(desgaste_calzado(&muchos), 100.0);
    }

    #[test]
    fn resistencia_baja_al_caminar_y_se_recupera() {
        // 10 km con lluvia (1.5) hace 2 h: fatiga 6, descanso +10
        let rs = [r(10.0, None, 2, 1.5)];
        let e = estado_fisico(&rs, None, ahora());
        assert_eq!(e.horas_descanso, 2.0);
        assert_eq!(e.resistencia, 100.0);

        // 30 km recién terminados con tormenta: 100 − 26.4
        let rs = [r(30.0, None, 0, 2.2)];
        assert_eq!(estado_fisico(&rs, None, ahora()).resistencia, 73.6);

        // Misiones de hace más de 48 h no cansan
        let viejas = [r(100.0, None, 60, 2.2)];
        assert_eq!(estado_fisico(&viejas, None, ahora()).resistencia, 100.0);
    }

    #[test]
    fn sin_misiones_y_reset_de_calzado() {
        let e = estado_fisico(&[], None, ahora());
        assert_eq!(
            (e.desgaste_calzado, e.resistencia, e.horas_descanso),
            (0.0, 100.0, 24.0)
        );

        let rs = [
            r(10.0, Some(TipoTerreno::Llano), 10, 1.0),
            r(10.0, Some(TipoTerreno::Llano), 1, 1.0),
        ];
        let reset = Some(ahora() - Duration::hours(5));
        assert_eq!(estado_fisico(&rs, reset, ahora()).desgaste_calzado, 1.0);
    }
}
