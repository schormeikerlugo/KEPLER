//! Prototipo del Centro de Control en Slint (paso 6).

#[path = "../../sim.rs"]
mod sim;

use std::rc::Rc;
use std::time::Duration;

use slint::{Model, ModelRc, SharedString, Timer, TimerMode, VecModel};

slint::include_modules!();

/// Polilínea SVG normalizada a 240×100 (y invertida).
fn trazado(datos: &[f32]) -> (String, String) {
    let (min, max) = (50.0f32, 110.0f32);
    let y = |v: f32| 100.0 - ((v - min) / (max - min)).clamp(0.0, 1.0) * 100.0;
    let mut linea = format!("M 0 {:.2}", y(datos[0]));
    for (i, v) in datos.iter().enumerate().skip(1) {
        linea.push_str(&format!(" L {i} {:.2}", y(*v)));
    }
    let area = format!("{linea} L {} 100 L 0 100 Z", datos.len() - 1);
    (linea, area)
}

fn main() -> Result<(), slint::PlatformError> {
    let ui = Panel::new()?;
    let mut sim = sim::Sim::new();

    let indicadores = Rc::new(VecModel::from(
        sim.indicadores()
            .into_iter()
            .map(|i| DatoIndicador { valor: i.valor.into(), etiqueta: i.etiqueta.into(), estado: i.estado })
            .collect::<Vec<_>>(),
    ));
    ui.set_indicadores(ModelRc::from(indicadores.clone()));

    let debil = ui.as_weak();
    let timer = Timer::default();
    timer.start(TimerMode::Repeated, Duration::from_millis(16), move || {
        let Some(ui) = debil.upgrade() else { return };
        sim.paso();
        let (linea, area) = trazado(&sim.bpm);
        ui.set_linea(SharedString::from(linea));
        ui.set_area(SharedString::from(area));
        ui.set_bpm(sim.bpm[sim::PUNTOS - 1].round() as i32);
        ui.set_calzado(sim.calzado);
        ui.set_resistencia(sim.resistencia);
        if sim.toca_indicadores() {
            for (fila, i) in sim.indicadores().into_iter().enumerate() {
                let mut d = indicadores.row_data(fila).unwrap_or_default();
                d.valor = i.valor.into();
                indicadores.set_row_data(fila, d);
            }
        }
    });

    ui.run()
}
