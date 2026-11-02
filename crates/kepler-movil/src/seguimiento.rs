//! Seguimiento entre fotogramas (estilo ByteTrack, sin apariencia): a 60 fps
//! un objeto apenas se mueve entre fotogramas, así que basta con asociar cajas
//! por solapamiento (IoU) y clase.
//!
//! - Las detecciones seguras (≥ [`UMBRAL_ALTO`]) crean y siguen pistas; las
//!   dudosas (≥ el umbral del detector) solo mantienen pistas ya existentes:
//!   así se puede bajar el umbral sin falsos positivos.
//! - Una pista se muestra tras [`CONFIRMAR`] fotogramas y aguanta
//!   [`MOSTRAR_PERDIDA`] sin detección (sin parpadeos); se borra a los
//!   [`OLVIDAR`].
//! - La caja se suaviza (media exponencial) para que no tiemble.
//! - Distancia aproximada por el tamaño típico de la clase.

use std::sync::Mutex;

use crate::vision::Deteccion;

pub const UMBRAL_ALTO: f32 = 0.35;
const IOU_MIN: f32 = 0.3;
const CONFIRMAR: u32 = 3;
const MOSTRAR_PERDIDA: u32 = 6;
const OLVIDAR: u32 = 30;
/// Peso de la caja nueva en el suavizado.
const SUAVIZADO: f32 = 0.55;

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Rastreada {
    /// Igual mientras el objeto siga a la vista.
    pub id: u64,
    pub deteccion: Deteccion,
    /// Fotogramas seguidos con detección (desde que nació la pista).
    pub edad: u32,
    /// Metros estimados por el tamaño típico de la clase (`None` si no se puede).
    pub distancia_m: Option<f32>,
}

#[derive(Debug, Clone)]
struct Pista {
    id: u64,
    d: Deteccion,
    aciertos: u32,
    perdidos: u32,
}

#[derive(Default)]
struct Interno {
    pistas: Vec<Pista>,
    siguiente: u64,
}

#[derive(uniffi::Object, Default)]
pub struct Seguidor {
    interno: Mutex<Interno>,
}

#[uniffi::export]
impl Seguidor {
    #[uniffi::constructor]
    pub fn new() -> std::sync::Arc<Self> {
        std::sync::Arc::new(Self::default())
    }

    /// Un fotograma: detecciones → objetos seguidos y confirmados.
    /// `focal_px`: distancia focal en píxeles para una imagen de `alto_px` de alto.
    pub fn actualizar(
        &self,
        detecciones: Vec<Deteccion>,
        focal_px: f32,
        alto_px: f32,
    ) -> Vec<Rastreada> {
        let mut s = self.interno.lock().expect("seguidor");
        let mut libres: Vec<Deteccion> = detecciones;
        libres.sort_by(|a, b| b.confianza.total_cmp(&a.confianza));
        let mut usadas = vec![false; libres.len()];
        // Mejor IoU primero, sobre todas las parejas de la misma clase
        let mut parejas: Vec<(f32, usize, usize)> = Vec::new();
        for (pi, p) in s.pistas.iter().enumerate() {
            for (di, d) in libres.iter().enumerate() {
                if d.clase == p.d.clase {
                    let v = iou(&p.d, d);
                    if v >= IOU_MIN {
                        parejas.push((v, pi, di));
                    }
                }
            }
        }
        parejas.sort_by(|a, b| b.0.total_cmp(&a.0));
        let mut pista_usada = vec![false; s.pistas.len()];
        for (_, pi, di) in parejas {
            if pista_usada[pi] || usadas[di] {
                continue;
            }
            pista_usada[pi] = true;
            usadas[di] = true;
            let p = &mut s.pistas[pi];
            p.d = suavizar(&p.d, &libres[di]);
            p.aciertos += 1;
            p.perdidos = 0;
        }
        for (pi, p) in s.pistas.iter_mut().enumerate() {
            if !pista_usada[pi] {
                p.perdidos += 1;
            }
        }
        s.pistas
            .retain(|p| p.perdidos <= OLVIDAR && (p.aciertos >= CONFIRMAR || p.perdidos == 0));
        for (di, d) in libres.into_iter().enumerate() {
            if !usadas[di] && d.confianza >= UMBRAL_ALTO {
                s.siguiente += 1;
                let id = s.siguiente;
                s.pistas.push(Pista {
                    id,
                    d,
                    aciertos: 1,
                    perdidos: 0,
                });
            }
        }
        s.pistas
            .iter()
            .filter(|p| p.aciertos >= CONFIRMAR && p.perdidos <= MOSTRAR_PERDIDA)
            .map(|p| Rastreada {
                id: p.id,
                distancia_m: distancia(&p.d, focal_px, alto_px),
                deteccion: p.d.clone(),
                edad: p.aciertos,
            })
            .collect()
    }

    pub fn reiniciar(&self) {
        *self.interno.lock().expect("seguidor") = Interno::default();
    }
}

fn iou(a: &Deteccion, b: &Deteccion) -> f32 {
    let (x1, y1) = (a.x.max(b.x), a.y.max(b.y));
    let (x2, y2) = (
        (a.x + a.ancho).min(b.x + b.ancho),
        (a.y + a.alto).min(b.y + b.alto),
    );
    let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let union = a.ancho * a.alto + b.ancho * b.alto - inter;
    if union > 0.0 { inter / union } else { 0.0 }
}

fn suavizar(antes: &Deteccion, ahora: &Deteccion) -> Deteccion {
    let m = |a: f32, b: f32| a + (b - a) * SUAVIZADO;
    Deteccion {
        x: m(antes.x, ahora.x),
        y: m(antes.y, ahora.y),
        ancho: m(antes.ancho, ahora.ancho),
        alto: m(antes.alto, ahora.alto),
        ..ahora.clone()
    }
}

/// Alto típico en metros de las clases que permiten estimar la distancia.
fn alto_tipico(clase: &str) -> Option<f32> {
    Some(match clase {
        "person" => 1.70,
        "car" => 1.50,
        "bus" => 3.20,
        "truck" => 3.00,
        "motorcycle" | "bicycle" => 1.10,
        "horse" => 1.60,
        "cow" => 1.40,
        "dog" => 0.55,
        "stop sign" | "traffic light" => 0.75,
        "fire hydrant" => 0.75,
        "bench" => 0.85,
        "chair" => 0.90,
        _ => return None,
    })
}

/// `d = f · H / h`. No se estima si la caja toca el borde de arriba o de abajo
/// (el objeto está cortado y parecería más lejos).
fn distancia(d: &Deteccion, focal_px: f32, alto_px: f32) -> Option<f32> {
    let h = alto_tipico(&d.clase)?;
    if focal_px <= 0.0 || d.y < 0.01 || d.y + d.alto > 0.99 {
        return None;
    }
    let px = d.alto * alto_px;
    (px >= 8.0).then(|| focal_px * h / px)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caja(clase: &str, x: f32, conf: f32) -> Deteccion {
        Deteccion {
            clase: clase.into(),
            nombre: clase.into(),
            confianza: conf,
            x,
            y: 0.3,
            ancho: 0.2,
            alto: 0.4,
        }
    }

    #[test]
    fn confirma_sigue_y_mantiene_el_id() {
        let s = Seguidor::default();
        assert!(
            s.actualizar(vec![caja("person", 0.10, 0.9)], 1400.0, 1920.0)
                .is_empty()
        );
        assert!(
            s.actualizar(vec![caja("person", 0.11, 0.9)], 1400.0, 1920.0)
                .is_empty()
        );
        let r = s.actualizar(vec![caja("person", 0.12, 0.9)], 1400.0, 1920.0);
        assert_eq!(r.len(), 1, "confirmada al tercer fotograma");
        let id = r[0].id;
        // Suavizada: entre la anterior y la nueva
        assert!(r[0].deteccion.x > 0.10 && r[0].deteccion.x < 0.12);
        // Un fotograma sin detección: sigue a la vista con el mismo id
        assert_eq!(s.actualizar(vec![], 1400.0, 1920.0)[0].id, id);
        // Una detección dudosa la mantiene
        assert_eq!(
            s.actualizar(vec![caja("person", 0.13, 0.25)], 1400.0, 1920.0)[0].id,
            id
        );
    }

    #[test]
    fn dudosas_no_crean_pistas_y_las_clases_no_se_mezclan() {
        let s = Seguidor::default();
        for _ in 0..5 {
            assert!(
                s.actualizar(vec![caja("person", 0.5, 0.25)], 1400.0, 1920.0)
                    .is_empty()
            );
        }
        for _ in 0..3 {
            s.actualizar(vec![caja("person", 0.1, 0.9)], 1400.0, 1920.0);
        }
        let r = s.actualizar(
            vec![caja("person", 0.1, 0.9), caja("dog", 0.1, 0.9)],
            1400.0,
            1920.0,
        );
        assert_eq!(r.len(), 1, "el perro aún no está confirmado: {r:?}");
        for _ in 0..(OLVIDAR + 1) {
            s.actualizar(vec![], 1400.0, 1920.0);
        }
        assert!(s.interno.lock().unwrap().pistas.is_empty(), "olvidadas");
    }

    #[test]
    fn distancia_por_tamano() {
        // Persona de 1.7 m que ocupa 340 px con focal 1400 → 7 m
        let mut d = caja("person", 0.4, 0.9);
        d.alto = 340.0 / 1920.0;
        assert!((distancia(&d, 1400.0, 1920.0).unwrap() - 7.0).abs() < 0.01);
        d.y = 0.0;
        assert!(
            distancia(&d, 1400.0, 1920.0).is_none(),
            "cortada por arriba"
        );
        assert!(distancia(&caja("cup", 0.4, 0.9), 1400.0, 1920.0).is_none());
    }
}
