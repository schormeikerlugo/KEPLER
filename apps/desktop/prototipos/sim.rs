//! Datos simulados comunes a los dos prototipos (mismo trabajo para medir igual).

pub const PUNTOS: usize = 240;

pub struct Indicador {
    pub valor: String,
    pub etiqueta: &'static str,
    /// 0 real · 1 coherente · 2 simulado
    pub estado: i32,
}

pub struct Sim {
    t: f64,
    pasos: u64,
    pub bpm: Vec<f32>,
    pub calzado: f32,
    pub resistencia: f32,
}

impl Sim {
    pub fn new() -> Self {
        Self { t: 0.0, pasos: 0, bpm: vec![72.0; PUNTOS], calzado: 0.88, resistencia: 1.0 }
    }

    /// Un paso de 16 ms: el gráfico se desplaza un punto.
    pub fn paso(&mut self) {
        self.t += 0.016;
        self.pasos += 1;
        let ruido = ((self.t * 37.0).sin() * (self.t * 11.0).cos()) as f32;
        let latido = ((self.t * 7.5).sin().powi(16) * 30.0) as f32;
        self.bpm.remove(0);
        self.bpm.push(72.0 + latido + ruido * 3.0 + (self.t * 0.3).sin() as f32 * 6.0);
        if self.pasos % 120 == 0 {
            self.calzado = 0.55 + 0.4 * ((self.t * 0.21).sin() as f32 * 0.5 + 0.5);
            self.resistencia = 0.35 + 0.65 * ((self.t * 0.17).cos() as f32 * 0.5 + 0.5);
        }
    }

    /// Los indicadores cambian cada 100 ms (6 pasos).
    pub fn toca_indicadores(&self) -> bool {
        self.pasos % 6 == 0
    }

    pub fn indicadores(&self) -> Vec<Indicador> {
        let t = self.t;
        let v = |a: f64, b: f64, f: f64| a + b * (t * f).sin();
        vec![
            Indicador { valor: format!("{:.0}°C", v(23.0, 1.5, 0.2)), etiqueta: "TEMP", estado: 0 },
            Indicador { valor: format!("{:.0}%", v(96.0, 2.0, 0.13)), etiqueta: "O2", estado: 2 },
            Indicador { valor: format!("{:.0}", self.bpm[PUNTOS - 1]), etiqueta: "BPM", estado: 1 },
            Indicador { valor: format!("{:.3}", v(0.023, 0.004, 0.5)), etiqueta: "RAD", estado: 2 },
            Indicador { valor: format!("{:.0}%", v(81.0, 3.0, 0.05)), etiqueta: "BATT", estado: 0 },
            Indicador { valor: format!("{:.0}%", v(97.0, 2.0, 0.9)), etiqueta: "LINK", estado: 0 },
            Indicador { valor: format!("{:.0}°C", v(41.0, 4.0, 0.08)), etiqueta: "TEMP S.", estado: 0 },
            Indicador { valor: format!("{:.0}", v(38.0, 6.0, 0.03)), etiqueta: "AIRE", estado: 0 },
        ]
    }
}
