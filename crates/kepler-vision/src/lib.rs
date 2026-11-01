//! Visión de KEPLER en el servidor (CPU, ONNX Runtime).
//!
//! * [`Detector`]: YOLO26 end-to-end (sin NMS), 640×640.
//! * [`Rastreador`]: ByteTrack, ids estables entre fotogramas.
//! * [`Embebedor`]: CLIP ViT-B/32, embedding de 512 dimensiones normalizado.
//!
//! Los modelos y sus parámetros se generan con `models/export/exportar.py`;
//! el iPhone usará el mismo preprocesado para que los embeddings sean comparables.

mod clip;
mod detector;
mod error;
mod imagen;
mod modelos;
mod rastreador;

pub use clip::Embebedor;
pub use detector::{Caja, Deteccion, Detector};
pub use error::{ErrorVision, Resultado};
pub use image::RgbImage;
pub use imagen::decodificar;
pub use modelos::{MetaModelos, Modelos};
pub use rastreador::{Rastreada, Rastreador};

/// Hilos de cálculo por sesión ONNX.
pub const HILOS_POR_DEFECTO: usize = 4;
