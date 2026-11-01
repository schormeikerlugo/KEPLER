use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::{Detector, Embebedor, ErrorVision, Resultado};

/// `modelos.json` generado por `models/export/exportar.py`.
#[derive(Debug, Clone, Deserialize)]
pub struct MetaModelos {
    pub yolo: MetaYolo,
    pub clip: MetaClip,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetaYolo {
    pub archivo: String,
    pub tamano: u32,
    pub clases: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetaClip {
    pub archivo: String,
    pub tamano: u32,
    pub media: [f32; 3],
    pub desviacion: [f32; 3],
    pub dimension: usize,
    /// Embedding de `referencia.png` con el pipeline de la v0.7 (para tests).
    #[serde(default)]
    pub referencia: Vec<f32>,
}

/// Detector + embebedor cargados desde un directorio.
pub struct Modelos {
    pub dir: PathBuf,
    pub meta: MetaModelos,
    pub detector: Detector,
    pub embebedor: Embebedor,
}

impl Modelos {
    pub fn cargar(dir: impl AsRef<Path>, hilos: usize) -> Resultado<Self> {
        let dir = dir.as_ref().to_path_buf();
        let texto = std::fs::read_to_string(dir.join("modelos.json")).map_err(|e| {
            ErrorVision::Modelos(format!("{}: {e}", dir.join("modelos.json").display()))
        })?;
        let meta: MetaModelos = serde_json::from_str(&texto)
            .map_err(|e| ErrorVision::Modelos(format!("modelos.json: {e}")))?;
        let detector = Detector::cargar(&dir.join(&meta.yolo.archivo), meta.yolo.clone(), hilos)?;
        let embebedor = Embebedor::cargar(&dir.join(&meta.clip.archivo), meta.clip.clone(), hilos)?;
        Ok(Self {
            dir,
            meta,
            detector,
            embebedor,
        })
    }
}

pub(crate) fn sesion(ruta: &Path, hilos: usize) -> Resultado<ort::session::Session> {
    use ort::session::{Session, builder::GraphOptimizationLevel};
    if !ruta.exists() {
        return Err(ErrorVision::Modelos(format!(
            "no existe {}",
            ruta.display()
        )));
    }
    let entorno = entorno()?;
    Ok(Session::builder(entorno)?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_intra_threads(hilos)?
        .commit_from_file(ruta)?)
}

fn entorno() -> Resultado<&'static ort::environment::Environment> {
    static ENTORNO: std::sync::OnceLock<ort::environment::Environment> = std::sync::OnceLock::new();
    if let Some(e) = ENTORNO.get() {
        return Ok(e);
    }
    let e = ort::init().with_name("kepler").build()?;
    Ok(ENTORNO.get_or_init(|| e))
}
