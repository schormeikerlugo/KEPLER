//! Fotos de los hallazgos: se piden a `/v1/imagenes/...`, se decodifican y
//! reducen fuera del hilo de la UI y se guardan en memoria por ruta y tamaño.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use image::imageops::FilterType;
use slint::{Image, Rgba8Pixel, SharedPixelBuffer};

use crate::api::Cliente;

/// Lado mayor de las miniaturas de las rejillas.
pub const MINIATURA: u32 = 360;
/// Lado mayor de las fotos en el detalle y el comparador.
pub const GRANDE: u32 = 1200;

pub type Pixeles = SharedPixelBuffer<Rgba8Pixel>;

#[derive(Default)]
pub struct Cache {
    fotos: Mutex<HashMap<(String, u32), Pixeles>>,
}

impl Cache {
    pub async fn obtener(&self, cliente: &Arc<Cliente>, ruta: &str, lado: u32) -> Option<Pixeles> {
        let clave = (ruta.to_owned(), lado);
        if let Some(p) = self.fotos.lock().expect("caché").get(&clave) {
            return Some(p.clone());
        }
        let bytes = cliente
            .get_bytes(&format!("/v1/imagenes/{ruta}"))
            .await
            .ok()?;
        let pixeles = tokio::task::spawn_blocking(move || decodificar(&bytes, lado))
            .await
            .ok()??;
        self.fotos
            .lock()
            .expect("caché")
            .insert(clave, pixeles.clone());
        Some(pixeles)
    }

    pub fn vaciar(&self) {
        self.fotos.lock().expect("caché").clear();
    }
}

pub fn decodificar(bytes: &[u8], lado: u32) -> Option<Pixeles> {
    let mut img = image::load_from_memory(bytes).ok()?;
    if img.width().max(img.height()) > lado {
        img = img.resize(lado, lado, FilterType::Triangle);
    }
    let rgba = img.to_rgba8();
    Some(SharedPixelBuffer::clone_from_slice(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
    ))
}

/// En el hilo de la UI.
pub fn a_imagen(p: Pixeles) -> Image {
    Image::from_rgba8(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reduce_al_lado_mayor() {
        let mut png = Vec::new();
        image::RgbaImage::new(800, 400)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let p = decodificar(&png, 200).unwrap();
        assert_eq!((p.width(), p.height()), (200, 100));
        assert!(decodificar(b"no es una imagen", 200).is_none());
    }
}
