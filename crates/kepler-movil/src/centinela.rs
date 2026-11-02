//! Centinela: captura automática de lo que entra en cuadro. Cada objeto
//! seguido se captura una sola vez (por su id de seguimiento) cuando está
//! estable y es claro; si la pista se pierde y vuelve, una espera por clase y
//! posición evita repetirlo. El servidor hace la Re-ID de personas.

use std::sync::Mutex;

use crate::seguimiento::Rastreada;

const CONFIANZA_MIN: f32 = 0.6;
/// Fotogramas seguidos antes de capturar (~0.3 s a 60 fps): caja estable y nítida.
const EDAD_MIN: u32 = 18;
/// Lado menor mínimo de la caja (fracción de la imagen): lo diminuto no sirve.
const LADO_MIN: f32 = 0.06;
/// Misma clase en la misma zona: no repetir antes de esto.
const ESPERA_ZONA_S: f64 = 15.0;
const IOU_ZONA: f32 = 0.3;
/// Separación mínima entre capturas.
const ESPERA_GLOBAL_S: f64 = 0.5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum ModoCentinela {
    Apagado,
    /// Solo personas.
    Personas,
    /// Todo lo que detecta YOLO.
    Todo,
}

#[derive(Default)]
struct Interno {
    capturadas: Vec<u64>,
    recientes: Vec<(String, [f32; 4], f64)>,
    ultima: f64,
}

#[derive(uniffi::Object)]
pub struct Centinela {
    modo: Mutex<ModoCentinela>,
    interno: Mutex<Interno>,
}

#[uniffi::export]
impl Centinela {
    #[uniffi::constructor]
    pub fn new() -> std::sync::Arc<Self> {
        std::sync::Arc::new(Self {
            modo: Mutex::new(ModoCentinela::Apagado),
            interno: Mutex::default(),
        })
    }

    pub fn modo(&self) -> ModoCentinela {
        *self.modo.lock().expect("centinela")
    }

    pub fn cambiar_modo(&self, modo: ModoCentinela) {
        *self.modo.lock().expect("centinela") = modo;
    }

    /// Lo que hay que capturar ahora (como mucho uno por llamada). `ahora_s`: segundos.
    pub fn evaluar(&self, rastreadas: Vec<Rastreada>, ahora_s: f64) -> Option<Rastreada> {
        let modo = self.modo();
        if modo == ModoCentinela::Apagado {
            return None;
        }
        let mut s = self.interno.lock().expect("centinela");
        if ahora_s - s.ultima < ESPERA_GLOBAL_S {
            return None;
        }
        s.recientes.retain(|r| ahora_s - r.2 < ESPERA_ZONA_S);
        let elegida = rastreadas
            .into_iter()
            .filter(|r| modo == ModoCentinela::Todo || r.deteccion.clase == "person")
            .filter(|r| r.deteccion.confianza >= CONFIANZA_MIN && r.edad >= EDAD_MIN)
            .filter(|r| r.deteccion.ancho.min(r.deteccion.alto) >= LADO_MIN)
            .filter(|r| !s.capturadas.contains(&r.id))
            .filter(|r| {
                let c = caja(r);
                !s.recientes
                    .iter()
                    .any(|(clase, z, _)| *clase == r.deteccion.clase && iou(z, &c) >= IOU_ZONA)
            })
            .max_by(|a, b| a.deteccion.confianza.total_cmp(&b.deteccion.confianza))?;
        s.capturadas.push(elegida.id);
        let c = caja(&elegida);
        s.recientes
            .push((elegida.deteccion.clase.clone(), c, ahora_s));
        s.ultima = ahora_s;
        Some(elegida)
    }

    /// Olvida lo capturado (otra sesión de vigilancia).
    pub fn reiniciar(&self) {
        *self.interno.lock().expect("centinela") = Interno::default();
    }
}

fn caja(r: &Rastreada) -> [f32; 4] {
    let d = &r.deteccion;
    [d.x, d.y, d.x + d.ancho, d.y + d.alto]
}

fn iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let inter =
        (a[2].min(b[2]) - a[0].max(b[0])).max(0.0) * (a[3].min(b[3]) - a[1].max(b[1])).max(0.0);
    let union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
    if union > 0.0 { inter / union } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vision::Deteccion;

    fn r(id: u64, clase: &str, x: f32, conf: f32, edad: u32) -> Rastreada {
        Rastreada {
            id,
            deteccion: Deteccion {
                clase: clase.into(),
                nombre: clase.into(),
                confianza: conf,
                x,
                y: 0.3,
                ancho: 0.2,
                alto: 0.4,
            },
            edad,
            distancia_m: None,
        }
    }

    #[test]
    fn una_vez_por_individuo_y_solo_lo_estable() {
        let c = Centinela::new();
        assert!(
            c.evaluar(vec![r(1, "person", 0.1, 0.9, 30)], 0.0).is_none(),
            "apagado"
        );
        c.cambiar_modo(ModoCentinela::Personas);
        assert!(
            c.evaluar(vec![r(1, "person", 0.1, 0.9, 5)], 0.0).is_none(),
            "aún inestable"
        );
        assert!(
            c.evaluar(vec![r(9, "car", 0.6, 0.9, 30)], 0.0).is_none(),
            "solo personas"
        );
        assert_eq!(
            c.evaluar(vec![r(1, "person", 0.1, 0.9, 30)], 1.0)
                .map(|x| x.id),
            Some(1)
        );
        assert!(
            c.evaluar(vec![r(1, "person", 0.1, 0.9, 30)], 3.0).is_none(),
            "ya capturada"
        );
        // Misma persona con otro id (pista perdida y recuperada) en la misma zona
        assert!(
            c.evaluar(vec![r(2, "person", 0.12, 0.9, 30)], 4.0)
                .is_none()
        );
        // Otra persona en otra zona
        assert_eq!(
            c.evaluar(vec![r(3, "person", 0.7, 0.9, 30)], 5.0)
                .map(|x| x.id),
            Some(3)
        );
        // Pasada la espera, la zona vuelve a valer
        assert_eq!(
            c.evaluar(vec![r(2, "person", 0.12, 0.9, 30)], 20.0)
                .map(|x| x.id),
            Some(2)
        );
    }

    #[test]
    fn modo_todo_y_separacion_entre_capturas() {
        let c = Centinela::new();
        c.cambiar_modo(ModoCentinela::Todo);
        assert_eq!(
            c.evaluar(vec![r(1, "car", 0.1, 0.9, 30)], 10.0)
                .map(|x| x.id),
            Some(1)
        );
        assert!(
            c.evaluar(vec![r(2, "dog", 0.6, 0.9, 30)], 10.2).is_none(),
            "menos de 0.5 s"
        );
        assert_eq!(
            c.evaluar(vec![r(2, "dog", 0.6, 0.9, 30)], 10.6)
                .map(|x| x.id),
            Some(2)
        );
        assert!(
            c.evaluar(vec![r(3, "cup", 0.3, 0.5, 30)], 12.0).is_none(),
            "poca confianza"
        );
    }
}
