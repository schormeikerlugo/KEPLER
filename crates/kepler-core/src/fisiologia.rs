//! Fisiología del explorador: perfil físico, zonas de pulso, línea base personal,
//! índice de Preparación y carga de esfuerzo (TRIMP) de una misión.
//!
//! Todo se compara con la normalidad del propio explorador (últimas semanas),
//! no con tablas generales. Es orientación, no consejo médico: un reloj de
//! consumo tiene error, sobre todo en SpO2 y estrés.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

/// Días de historial que forman la línea base.
pub const DIAS_BASE: usize = 28;
/// Días con datos a partir de los que la línea base se considera fiable.
pub const DIAS_MINIMOS: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sexo {
    Hombre,
    Mujer,
}

/// Lo que el explorador declara de sí mismo (todo opcional: se estima lo que falte).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PerfilFisico {
    pub edad: Option<u8>,
    pub peso_kg: Option<f64>,
    pub altura_cm: Option<f64>,
    pub sexo: Option<Sexo>,
    /// Pulso máximo real, si lo conoce (si no, se estima por la edad).
    pub fc_max: Option<u16>,
    /// Pulso en reposo declarado (si no, el medido por el reloj).
    pub fc_reposo: Option<u16>,
}

/// Pulsos de referencia para calcular zonas y carga.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Pulsos {
    pub maximo: f64,
    pub reposo: f64,
    /// El máximo es una estimación (no declarado ni observado).
    pub maximo_estimado: bool,
}

impl PerfilFisico {
    /// Pulso máximo: declarado › observado en misiones (si es mayor que la
    /// estimación) › Tanaka (208 − 0,7·edad) › 190.
    pub fn pulsos(&self, reposo_medido: Option<f64>, maximo_observado: Option<f64>) -> Pulsos {
        let estimado = self.edad.map_or(190.0, |e| 208.0 - 0.7 * f64::from(e));
        let (maximo, maximo_estimado) = match (self.fc_max, maximo_observado) {
            (Some(m), _) => (f64::from(m), false),
            (None, Some(o)) if o > estimado => (o, false),
            _ => (estimado, true),
        };
        let reposo = self
            .fc_reposo
            .map(f64::from)
            .or(reposo_medido)
            .unwrap_or(60.0)
            .clamp(30.0, maximo - 40.0);
        Pulsos {
            maximo,
            reposo,
            maximo_estimado,
        }
    }
}

impl Pulsos {
    /// Fracción de la reserva cardíaca (Karvonen): 0 = reposo, 1 = máximo.
    pub fn reserva(&self, fc: f64) -> f64 {
        ((fc - self.reposo) / (self.maximo - self.reposo)).clamp(0.0, 1.0)
    }

    /// Zona 0 (por debajo de la 1) a 5, con límites al 50/60/70/80/90 % de la reserva.
    pub fn zona(&self, fc: f64) -> u8 {
        let r = self.reserva(fc);
        [0.5, 0.6, 0.7, 0.8, 0.9]
            .iter()
            .filter(|&&l| r >= l)
            .count() as u8
    }

    /// Límite inferior (lpm) de cada zona 1..5.
    pub fn limites(&self) -> [u16; 5] {
        [0.5, 0.6, 0.7, 0.8, 0.9]
            .map(|f| (self.reposo + f * (self.maximo - self.reposo)).round() as u16)
    }
}

/// Muestra de pulso: segundos Unix y lpm.
pub type MuestraPulso = (f64, f64);

/// Huecos mayores que esto entre dos muestras no cuentan como esfuerzo.
const HUECO_MAX_S: f64 = 15.0 * 60.0;

/// Segundos en cada zona (0..=5): cada muestra vale hasta la siguiente.
pub fn tiempo_por_zona(muestras: &[MuestraPulso], p: &Pulsos) -> [f64; 6] {
    let mut z = [0.0; 6];
    for w in muestras.windows(2) {
        let dt = (w[1].0 - w[0].0).clamp(0.0, HUECO_MAX_S);
        z[p.zona(w[0].1) as usize] += dt;
    }
    z
}

/// TRIMP de Banister: minutos ponderados por la intensidad (exponencial con la
/// reserva cardíaca). ~100 es una hora a ritmo moderado-alto.
pub fn trimp(muestras: &[MuestraPulso], p: &Pulsos, sexo: Option<Sexo>) -> f64 {
    let k = match sexo {
        Some(Sexo::Hombre) => 1.92,
        Some(Sexo::Mujer) => 1.67,
        None => 1.8,
    };
    muestras
        .windows(2)
        .map(|w| {
            let min = (w[1].0 - w[0].0).clamp(0.0, HUECO_MAX_S) / 60.0;
            let r = p.reserva((w[0].1 + w[1].1) / 2.0);
            min * r * 0.64 * (k * r).exp()
        })
        .sum()
}

/// Desnivel positivo y negativo (m) de una serie de altitudes, con histéresis
/// para no sumar el ruido del GPS o del barómetro.
pub fn desnivel(altitudes: &[f64], umbral_m: f64) -> (f64, f64) {
    let mut it = altitudes.iter().copied().filter(|a| a.is_finite());
    let Some(mut ref_) = it.next() else {
        return (0.0, 0.0);
    };
    let (mut sube, mut baja) = (0.0, 0.0);
    for a in it {
        let d = a - ref_;
        if d >= umbral_m {
            sube += d;
            ref_ = a;
        } else if d <= -umbral_m {
            baja -= d;
            ref_ = a;
        }
    }
    (sube, baja)
}

/// Lo que se sabe de un día (todo opcional salvo la carga).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ResumenDia {
    pub fecha: NaiveDate,
    /// Horas dormidas la noche que termina ese día.
    pub sueno_h: Option<f64>,
    pub pulso_reposo: Option<f64>,
    /// Estrés medio del reloj (0–100).
    pub estres: Option<f64>,
    /// SpO2 media (%).
    pub spo2: Option<f64>,
    /// Ánimo normalizado de −1 (muy mal) a 1 (muy bien).
    pub animo: Option<f64>,
    pub pasos: Option<f64>,
    /// TRIMP de las misiones del día.
    #[serde(default)]
    pub carga: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Factor {
    pub clave: String,
    pub nombre: String,
    pub valor: Option<f64>,
    /// Lo normal para el explorador (mediana de su historial).
    pub base: Option<f64>,
    /// Lo que suma o resta a la Preparación.
    pub puntos: f64,
    pub texto: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Preparacion {
    /// 0–100.
    pub puntuacion: u8,
    /// `alta` (≥ 75), `media` (≥ 50) o `baja`.
    pub nivel: String,
    pub resumen: String,
    pub factores: Vec<Factor>,
    /// Hay historial suficiente para comparar con lo normal del explorador.
    pub linea_base: bool,
    /// Carga aguda (7 d) / crónica (28 d).
    pub carga_relativa: Option<f64>,
}

fn mediana(mut v: Vec<f64>) -> Option<f64> {
    v.retain(|x| x.is_finite());
    if v.is_empty() {
        return None;
    }
    v.sort_by(f64::total_cmp);
    let n = v.len();
    Some(if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    })
}

fn base(hist: &[ResumenDia], f: impl Fn(&ResumenDia) -> Option<f64>) -> Option<f64> {
    let v: Vec<f64> = hist.iter().filter_map(f).collect();
    (v.len() >= DIAS_MINIMOS).then(|| mediana(v)).flatten()
}

/// Preparación de `hoy` frente al `historial` (días anteriores, cualquier orden).
pub fn preparacion(hoy: &ResumenDia, historial: &[ResumenDia]) -> Preparacion {
    let mut hist: Vec<&ResumenDia> = historial.iter().filter(|d| d.fecha < hoy.fecha).collect();
    hist.sort_by_key(|d| std::cmp::Reverse(d.fecha));
    hist.truncate(DIAS_BASE);
    let hist: Vec<ResumenDia> = hist.into_iter().cloned().collect();
    let mut factores = Vec::new();
    let mut f = |clave: &str,
                 nombre: &str,
                 valor: Option<f64>,
                 base: Option<f64>,
                 puntos: f64,
                 texto: String| {
        factores.push(Factor {
            clave: clave.into(),
            nombre: nombre.into(),
            valor,
            base,
            puntos: (puntos * 10.0).round() / 10.0,
            texto,
        });
    };

    // Sueño: frente a su media (o 7 h sin historial)
    let b_sueno = base(&hist, |d| d.sueno_h);
    match hoy.sueno_h {
        Some(h) => {
            let ref_ = b_sueno.unwrap_or(7.0);
            let mut p = ((h - ref_) * 6.0).clamp(-20.0, 8.0);
            if h < 5.0 {
                p -= 8.0;
            }
            let texto = format!("Dormiste {h:.1} h (lo normal en ti: {ref_:.1} h)");
            f("sueno", "Sueño", Some(h), b_sueno, p, texto);
        }
        None => f(
            "sueno",
            "Sueño",
            None,
            b_sueno,
            0.0,
            "Sin datos de sueño de anoche".into(),
        ),
    }

    // Pulso en reposo: más alto de lo normal = cansancio, enfermedad o estrés
    let b_fc = base(&hist, |d| d.pulso_reposo);
    if let (Some(fc), Some(b)) = (hoy.pulso_reposo, b_fc) {
        let d = fc - b;
        let texto = if d >= 3.0 {
            format!("Pulso en reposo {fc:.0} lpm, {d:.0} por encima de lo normal")
        } else if d <= -3.0 {
            format!("Pulso en reposo {fc:.0} lpm, por debajo de lo normal (buena señal)")
        } else {
            format!("Pulso en reposo {fc:.0} lpm, normal")
        };
        f(
            "pulso_reposo",
            "Pulso en reposo",
            Some(fc),
            Some(b),
            (-d * 2.0).clamp(-18.0, 6.0),
            texto,
        );
    } else {
        f(
            "pulso_reposo",
            "Pulso en reposo",
            hoy.pulso_reposo,
            b_fc,
            0.0,
            "Aún sin línea base de pulso en reposo".into(),
        );
    }

    if let Some(e) = hoy.estres {
        let texto = format!("Estrés medio {e:.0}/100");
        f(
            "estres",
            "Estrés",
            Some(e),
            base(&hist, |d| d.estres),
            ((40.0 - e) * 0.25).clamp(-12.0, 5.0),
            texto,
        );
    }
    if let Some(a) = hoy.animo {
        let texto = if a >= 0.3 {
            "Ánimo positivo"
        } else if a <= -0.3 {
            "Ánimo bajo"
        } else {
            "Ánimo neutro"
        };
        f("animo", "Ánimo", Some(a), None, a * 5.0, texto.into());
    }
    if let Some(s) = hoy.spo2.filter(|s| *s < 94.0) {
        f(
            "spo2",
            "Oxígeno",
            Some(s),
            base(&hist, |d| d.spo2),
            (-(94.0 - s) * 3.0).max(-15.0),
            format!("SpO2 baja: {s:.0} %"),
        );
    }

    // Carga aguda (7 d) frente a crónica (28 d): saltos bruscos → riesgo de lesión
    let suma = |dias: i64| {
        historial
            .iter()
            .filter(|d| d.fecha < hoy.fecha && (hoy.fecha - d.fecha).num_days() <= dias)
            .map(|d| d.carga)
            .sum::<f64>()
    };
    let (aguda, cronica) = (suma(7) / 7.0, suma(28) / 28.0);
    let carga_relativa = (cronica > 1.0).then(|| aguda / cronica);
    match carga_relativa {
        Some(r) if r > 1.5 => f(
            "carga",
            "Carga reciente",
            Some(r),
            Some(1.0),
            (-(r - 1.5) * 30.0).max(-15.0),
            format!(
                "Esta semana cargaste {:.0} % más de lo habitual",
                (r - 1.0) * 100.0
            ),
        ),
        Some(r) if r < 0.8 => f(
            "carga",
            "Carga reciente",
            Some(r),
            Some(1.0),
            3.0,
            "Semana suave: llegas descansado".into(),
        ),
        Some(r) => f(
            "carga",
            "Carga reciente",
            Some(r),
            Some(1.0),
            0.0,
            "Carga de la semana en tu rango habitual".into(),
        ),
        None => {}
    }

    let total: f64 = factores.iter().map(|x| x.puntos).sum();
    let puntuacion = (75.0 + total).round().clamp(0.0, 100.0) as u8;
    let nivel = match puntuacion {
        75.. => "alta",
        50.. => "media",
        _ => "baja",
    };
    // Lo que más resta (o, si nada resta, lo que más suma)
    let mut orden: Vec<&Factor> = factores.iter().filter(|x| x.puntos != 0.0).collect();
    orden.sort_by(|a, b| a.puntos.total_cmp(&b.puntos));
    let clave = orden
        .iter()
        .filter(|x| x.puntos < 0.0)
        .take(2)
        .map(|x| x.texto.to_lowercase())
        .collect::<Vec<_>>();
    let resumen = match (nivel, clave.is_empty()) {
        ("alta", _) => "Buen estado para una misión exigente".to_owned(),
        (_, false) => format!("Atención: {}", clave.join("; ")),
        ("media", true) => "Estado normal: misión moderada".to_owned(),
        _ => "Mejor una misión corta o descansar".to_owned(),
    };
    Preparacion {
        puntuacion,
        nivel: nivel.into(),
        resumen,
        factores,
        linea_base: hist
            .iter()
            .filter(|d| d.sueno_h.is_some() || d.pulso_reposo.is_some())
            .count()
            >= DIAS_MINIMOS,
        carga_relativa: carga_relativa.map(|r| (r * 100.0).round() / 100.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dia(n: u32, sueno: f64, fc: f64) -> ResumenDia {
        ResumenDia {
            fecha: NaiveDate::from_ymd_opt(2026, 10, n).unwrap(),
            sueno_h: Some(sueno),
            pulso_reposo: Some(fc),
            carga: 40.0,
            ..Default::default()
        }
    }

    #[test]
    fn zonas_y_pulso_maximo() {
        let p = PerfilFisico {
            edad: Some(30),
            ..Default::default()
        }
        .pulsos(Some(60.0), None);
        assert!((p.maximo - 187.0).abs() < 1e-9);
        assert!(p.maximo_estimado);
        assert_eq!(p.zona(60.0), 0);
        assert_eq!(p.zona(130.0), 1); // 55 % de la reserva
        assert_eq!(p.zona(145.0), 2); // 67 %
        assert_eq!(p.zona(186.0), 5);
        assert_eq!(p.limites()[0], 124);
        // Un máximo observado mayor que la estimación manda
        let o = PerfilFisico {
            edad: Some(30),
            ..Default::default()
        }
        .pulsos(None, Some(195.0));
        assert_eq!((o.maximo, o.maximo_estimado), (195.0, false));
    }

    #[test]
    fn carga_y_desnivel() {
        let p = Pulsos {
            maximo: 190.0,
            reposo: 60.0,
            maximo_estimado: false,
        };
        // Una hora a 151 lpm (70 % de la reserva)
        let m: Vec<MuestraPulso> = (0..=60).map(|i| (f64::from(i) * 60.0, 151.0)).collect();
        let t = trimp(&m, &p, Some(Sexo::Hombre));
        assert!(
            (t - 60.0 * 0.7 * 0.64 * (1.92f64 * 0.7).exp()).abs() < 0.5,
            "{t}"
        );
        assert_eq!(tiempo_por_zona(&m, &p)[3], 3600.0);
        // Un hueco de 2 h no cuenta entero
        assert_eq!(
            tiempo_por_zona(&[(0.0, 100.0), (7200.0, 100.0)], &p)
                .iter()
                .sum::<f64>(),
            HUECO_MAX_S
        );
        let (s, b) = desnivel(&[100.0, 101.0, 99.5, 110.0, 120.0, 118.0, 105.0], 3.0);
        assert_eq!((s, b), (20.0, 15.0));
    }

    #[test]
    fn preparacion_frente_a_lo_normal() {
        let hist: Vec<ResumenDia> = (1..=20).map(|n| dia(n, 7.0, 58.0)).collect();
        let bien = preparacion(&dia(21, 7.5, 57.0), &hist);
        assert!(bien.linea_base);
        assert_eq!(bien.nivel, "alta", "{bien:?}");
        let mal = preparacion(&dia(21, 4.5, 66.0), &hist);
        assert!(mal.puntuacion < 50, "{mal:?}");
        assert!(mal.resumen.contains("dormiste 4.5 h"), "{}", mal.resumen);
        // Sin historial: no hay base de pulso, solo cuenta el sueño frente a 7 h
        let solo = preparacion(&dia(21, 7.0, 70.0), &[]);
        assert!(!solo.linea_base);
        assert_eq!(solo.puntuacion, 75);
    }

    #[test]
    fn salto_de_carga() {
        let mut hist: Vec<ResumenDia> = (1..=28)
            .map(|n| ResumenDia {
                carga: 20.0,
                ..dia(n, 7.0, 58.0)
            })
            .collect();
        for d in hist
            .iter_mut()
            .filter(|d| d.fecha.format("%d").to_string().parse::<u32>().unwrap() > 22)
        {
            d.carga = 120.0;
        }
        let p = preparacion(&dia(29, 7.0, 58.0), &hist);
        assert!(p.carga_relativa.unwrap() > 1.5, "{p:?}");
        assert!(
            p.factores
                .iter()
                .any(|f| f.clave == "carga" && f.puntos < 0.0)
        );
    }
}
