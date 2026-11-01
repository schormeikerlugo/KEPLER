//! Vigencia de un reporte compartido (peligro, persona hostil, POI).
//!
//! Un reporte sigue vigente mientras alguien lo confirme: si nadie lo hace en
//! [`DIAS_VIGENCIA`] días pasa a "sin verificar" y pesa la mitad en el riesgo.
//! Si alguien informa que ya no está después de la última confirmación, queda
//! retirado y no cuenta.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

pub const DIAS_VIGENCIA: i64 = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Vigencia {
    Vigente,
    SinVerificar,
    Retirado,
}

impl Vigencia {
    /// `reportado`: cuándo se capturó. Las confirmaciones son las más recientes de cada tipo.
    pub fn calcular(
        reportado: DateTime<Utc>,
        ultima_confirmacion: Option<DateTime<Utc>>,
        ultimo_rechazo: Option<DateTime<Utc>>,
        ahora: DateTime<Utc>,
    ) -> Self {
        let ultima_ok = ultima_confirmacion.map_or(reportado, |c| c.max(reportado));
        if ultimo_rechazo.is_some_and(|r| r > ultima_ok) {
            Self::Retirado
        } else if ahora - ultima_ok > Duration::days(DIAS_VIGENCIA) {
            Self::SinVerificar
        } else {
            Self::Vigente
        }
    }

    /// Puntos de riesgo que conserva un peligro con esta vigencia.
    pub const fn ponderar(self, puntos: u32) -> u32 {
        match self {
            Self::Vigente => puntos,
            Self::SinVerificar => puntos.div_ceil(2),
            Self::Retirado => 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn t(dias: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 1, 12, 0, 0).unwrap() + Duration::days(dias)
    }

    #[test]
    fn caduca_y_se_renueva() {
        assert_eq!(
            Vigencia::calcular(t(0), None, None, t(10)),
            Vigencia::Vigente
        );
        assert_eq!(
            Vigencia::calcular(t(0), None, None, t(31)),
            Vigencia::SinVerificar
        );
        assert_eq!(
            Vigencia::calcular(t(0), Some(t(20)), None, t(31)),
            Vigencia::Vigente
        );
    }

    #[test]
    fn retirado_hasta_que_alguien_lo_confirme() {
        assert_eq!(
            Vigencia::calcular(t(0), None, Some(t(5)), t(6)),
            Vigencia::Retirado
        );
        assert_eq!(
            Vigencia::calcular(t(0), Some(t(7)), Some(t(5)), t(8)),
            Vigencia::Vigente
        );
    }

    #[test]
    fn ponderacion() {
        assert_eq!(Vigencia::Vigente.ponderar(15), 15);
        assert_eq!(Vigencia::SinVerificar.ponderar(15), 8);
        assert_eq!(Vigencia::Retirado.ponderar(15), 0);
    }
}
