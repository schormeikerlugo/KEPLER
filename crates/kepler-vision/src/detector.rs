use std::path::Path;
use std::sync::Mutex;

use image::RgbImage;
use ort::value::Tensor;
use serde::Serialize;

use crate::imagen::tensor_yolo;
use crate::modelos::{MetaYolo, sesion};
use crate::{ErrorVision, Resultado};

/// Caja normalizada a [0, 1] respecto a la imagen original (como `kepler-proto`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Caja {
    pub x: f32,
    pub y: f32,
    pub ancho: f32,
    pub alto: f32,
}

impl Caja {
    pub fn iou(&self, otra: &Caja) -> f32 {
        let x1 = self.x.max(otra.x);
        let y1 = self.y.max(otra.y);
        let x2 = (self.x + self.ancho).min(otra.x + otra.ancho);
        let y2 = (self.y + self.alto).min(otra.y + otra.alto);
        let interseccion = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
        let union = self.ancho * self.alto + otra.ancho * otra.alto - interseccion;
        if union > 0.0 {
            interseccion / union
        } else {
            0.0
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Deteccion {
    pub clase: String,
    pub clase_id: usize,
    pub confianza: f32,
    pub caja: Caja,
}

/// YOLO26 end-to-end: la salida `[1, 300, 6]` ya viene sin duplicados.
pub struct Detector {
    sesion: Mutex<ort::session::Session>,
    meta: MetaYolo,
}

impl Detector {
    pub fn cargar(ruta: &Path, meta: MetaYolo, hilos: usize) -> Resultado<Self> {
        Ok(Self {
            sesion: Mutex::new(sesion(ruta, hilos)?),
            meta,
        })
    }

    pub fn clases(&self) -> &[String] {
        &self.meta.clases
    }

    /// Detecciones con confianza ≥ `umbral`, de mayor a menor confianza.
    pub fn detectar(&self, img: &RgbImage, umbral: f32) -> Resultado<Vec<Deteccion>> {
        let lado = self.meta.tamano;
        let (datos, lb) = tensor_yolo(img, lado);
        let entrada = Tensor::from_array(([1usize, 3, lado as usize, lado as usize], datos))?;
        let mut sesion = self
            .sesion
            .lock()
            .map_err(|_| ErrorVision::Inferencia("sesión envenenada".into()))?;
        let salidas = sesion.run(ort::inputs!["images" => entrada])?;
        let (forma, valores) = salidas[0].try_extract_tensor::<f32>()?;
        if forma.len() != 3 || forma[2] != 6 {
            return Err(ErrorVision::Modelos(format!(
                "salida YOLO inesperada {forma:?}: ¿modelo end-to-end?"
            )));
        }

        let (w, h) = (img.width() as f32, img.height() as f32);
        let mut dets: Vec<Deteccion> = valores
            .as_chunks::<6>()
            .0
            .iter()
            .filter(|f| f[4] >= umbral)
            .filter_map(|f| {
                let clase_id = f[5] as usize;
                let (x1, y1) = lb.deshacer(f[0], f[1]);
                let (x2, y2) = lb.deshacer(f[2], f[3]);
                let (x1, y1) = (x1.clamp(0.0, w), y1.clamp(0.0, h));
                let (x2, y2) = (x2.clamp(0.0, w), y2.clamp(0.0, h));
                (x2 > x1 && y2 > y1).then(|| Deteccion {
                    clase: self
                        .meta
                        .clases
                        .get(clase_id)
                        .cloned()
                        .unwrap_or_else(|| format!("clase_{clase_id}")),
                    clase_id,
                    confianza: f[4],
                    caja: Caja {
                        x: x1 / w,
                        y: y1 / h,
                        ancho: (x2 - x1) / w,
                        alto: (y2 - y1) / h,
                    },
                })
            })
            .collect();
        dets.sort_by(|a, b| b.confianza.total_cmp(&a.confianza));
        Ok(dets)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iou() {
        let a = Caja {
            x: 0.0,
            y: 0.0,
            ancho: 0.2,
            alto: 0.2,
        };
        let b = Caja {
            x: 0.1,
            y: 0.0,
            ancho: 0.2,
            alto: 0.2,
        };
        assert!((a.iou(&b) - 1.0 / 3.0).abs() < 1e-6);
        assert_eq!(
            a.iou(&Caja {
                x: 0.5,
                y: 0.5,
                ancho: 0.1,
                alto: 0.1
            }),
            0.0
        );
        assert!((a.iou(&a) - 1.0).abs() < 1e-6);
    }
}
