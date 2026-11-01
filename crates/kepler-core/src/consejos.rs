//! Consejo del día: según el estado del explorador si hay algo que decir, o
//! uno general. Compartido por el Centro de Control y la Unidad de Campo.

use crate::entorno::CategoriaClima;

/// Lo que el consejo tiene en cuenta (cada dato es opcional).
#[derive(Debug, Clone, Default)]
pub struct Situacion {
    pub desgaste_calzado: Option<f64>,
    pub resistencia: Option<f64>,
    pub clima: Option<CategoriaClima>,
    pub pois_riesgo_alto: u64,
    pub misiones_sin_reporte: u64,
}

/// Un consejo; `semilla` elige entre los posibles (p. ej. nanosegundos).
pub fn consejo(s: &Situacion, semilla: usize) -> String {
    let mut contexto = Vec::new();
    if let Some(d) = s.desgaste_calzado.filter(|d| *d > 70.0) {
        contexto.push(format!(
            "👟 Tu calzado está al {d:.0} % de desgaste: revísalo antes de la próxima misión."
        ));
    }
    if let Some(r) = s.resistencia.filter(|r| *r < 40.0) {
        contexto.push(format!(
            "⚡ Resistencia al {r:.0} %: hoy toca descanso o una ruta corta en terreno llano."
        ));
    }
    match s.clima {
        Some(CategoriaClima::Lluvia | CategoriaClima::Tormenta) => contexto.push(
            "🌧️ Hay lluvia en tu zona: evita quebradas y terreno rocoso, el riesgo de resbalar se dispara.".into(),
        ),
        Some(CategoriaClima::Caluroso) => contexto
            .push("🌡️ Hace calor: sal temprano y lleva al menos 1 L de agua por cada 5 km.".into()),
        Some(CategoriaClima::VientoFuerte) => {
            contexto.push("💨 Viento fuerte: evita crestas y zonas expuestas.".into());
        }
        _ => {}
    }
    if s.pois_riesgo_alto > 0 {
        contexto.push(format!(
            "⚠️ Tienes {} POI de riesgo alto o crítico registrados: revisa si siguen vigentes antes de volver a la zona.",
            s.pois_riesgo_alto
        ));
    }
    if s.misiones_sin_reporte > 0 {
        contexto.push(
            "📝 Tienes misiones sin documentar: el mejor reporte se escribe en las primeras 2 h."
                .into(),
        );
    }
    match contexto.get(semilla % contexto.len().max(1)) {
        Some(c) => c.clone(),
        None => GENERALES[semilla % GENERALES.len()].to_owned(),
    }
}

const GENERALES: &[&str] = &[
    "🧭 Verifica tu brújula antes de adentrarte en zona desconocida.",
    "💧 Hidratación: lleva al menos 1 L de agua por cada 5 km de exploración.",
    "📷 Documenta todo hallazgo con foto antes de manipularlo.",
    "🔋 Carga todos tus dispositivos antes de salir a campo.",
    "🗺️ Descarga el mapa offline de la zona antes de perder la cobertura.",
    "👥 Nunca explores zonas de riesgo alto sin un compañero de apoyo.",
    "🎒 Revisa tu equipo 24 h antes de cada misión, no el mismo día.",
    "🔦 Lleva una fuente de luz extra, incluso en misiones diurnas.",
    "⏰ Planifica el regreso con margen: calcula un 30 % más de tiempo del estimado.",
    "📻 Establece un horario fijo de comunicación con tu base.",
    "⚡ Si ves relámpagos, busca refugio bajo. Evita crestas y árboles aislados.",
    "🧊 En terreno rocoso, cada paso debe ser deliberado: la prisa causa lesiones.",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn de_contexto_si_hay_algo_que_decir() {
        let s = Situacion {
            desgaste_calzado: Some(85.0),
            resistencia: Some(90.0),
            ..Default::default()
        };
        assert!(consejo(&s, 7).contains("calzado"));
        let lluvia = Situacion {
            clima: Some(CategoriaClima::Tormenta),
            ..Default::default()
        };
        assert!(consejo(&lluvia, 0).contains("lluvia"));
        assert!(GENERALES.contains(&consejo(&Situacion::default(), 3).as_str()));
    }
}
