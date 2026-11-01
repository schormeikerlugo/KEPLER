use std::path::Path;
use std::sync::Mutex;

use image::RgbImage;
use ort::value::Tensor;

use crate::imagen::tensor_clip;
use crate::modelos::{MetaClip, sesion};
use crate::{ErrorVision, Resultado};

/// Encoder de imagen CLIP ViT-B/32: embedding de 512 dimensiones con norma 1
/// (la similitud de coseno es el producto escalar, como en pgvector).
pub struct Embebedor {
    sesion: Mutex<ort::session::Session>,
    meta: MetaClip,
}

impl Embebedor {
    pub fn cargar(ruta: &Path, meta: MetaClip, hilos: usize) -> Resultado<Self> {
        Ok(Self {
            sesion: Mutex::new(sesion(ruta, hilos)?),
            meta,
        })
    }

    pub fn embedding(&self, img: &RgbImage) -> Resultado<Vec<f32>> {
        Ok(self
            .lote(std::slice::from_ref(img))?
            .pop()
            .unwrap_or_default())
    }

    /// Varias imágenes en una sola inferencia.
    pub fn lote(&self, imgs: &[RgbImage]) -> Resultado<Vec<Vec<f32>>> {
        if imgs.is_empty() {
            return Ok(Vec::new());
        }
        let lado = self.meta.tamano as usize;
        let datos: Vec<f32> = imgs
            .iter()
            .flat_map(|i| tensor_clip(i, self.meta.tamano, self.meta.media, self.meta.desviacion))
            .collect();
        let entrada = Tensor::from_array(([imgs.len(), 3, lado, lado], datos))?;
        let mut sesion = self
            .sesion
            .lock()
            .map_err(|_| ErrorVision::Inferencia("sesión envenenada".into()))?;
        let salidas = sesion.run(ort::inputs!["pixeles" => entrada])?;
        let (forma, valores) = salidas[0].try_extract_tensor::<f32>()?;
        let dim = self.meta.dimension;
        if forma.last().copied() != Some(dim as i64) {
            return Err(ErrorVision::Modelos(format!(
                "salida CLIP inesperada {forma:?}"
            )));
        }
        Ok(valores.chunks_exact(dim).map(<[f32]>::to_vec).collect())
    }
}
