use image::RgbImage;
use image::imageops::FilterType;

use crate::Resultado;

/// JPEG o PNG → RGB.
pub fn decodificar(bytes: &[u8]) -> Resultado<RgbImage> {
    Ok(image::load_from_memory(bytes)?.to_rgb8())
}

/// Redimensionado con bandas grises (como Ultralytics): mantiene la proporción
/// y centra la imagen en un lienzo cuadrado de `lado`.
pub struct Letterbox {
    pub escala: f32,
    pub pad_x: f32,
    pub pad_y: f32,
}

impl Letterbox {
    pub fn calcular(ancho: u32, alto: u32, lado: u32) -> Self {
        let escala = (lado as f32 / ancho as f32).min(lado as f32 / alto as f32);
        let (w, h) = (
            (ancho as f32 * escala).round(),
            (alto as f32 * escala).round(),
        );
        Self {
            escala,
            pad_x: ((lado as f32 - w) / 2.0).floor(),
            pad_y: ((lado as f32 - h) / 2.0).floor(),
        }
    }

    /// Coordenada del lienzo → coordenada de la imagen original.
    pub fn deshacer(&self, x: f32, y: f32) -> (f32, f32) {
        (
            (x - self.pad_x) / self.escala,
            (y - self.pad_y) / self.escala,
        )
    }
}

/// Tensor NCHW en [0, 1] para YOLO. Bilineal como `cv2.INTER_LINEAR` (centros
/// de píxel, sin suavizado), igual que el preprocesado de Ultralytics.
pub fn tensor_yolo(img: &RgbImage, lado: u32) -> (Vec<f32>, Letterbox) {
    let lb = Letterbox::calcular(img.width(), img.height(), lado);
    let w = ((img.width() as f32 * lb.escala).round() as u32).max(1);
    let h = ((img.height() as f32 * lb.escala).round() as u32).max(1);
    let (ox, oy) = (lb.pad_x as u32, lb.pad_y as u32);
    let plano = (lado * lado) as usize;
    let mut t = vec![114.0 / 255.0; 3 * plano];

    let (sw, sh) = (
        img.width() as f32 / w as f32,
        img.height() as f32 / h as f32,
    );
    let muestras = |destino: u32, escala: f32, max: u32| {
        let s = ((destino as f32 + 0.5) * escala - 0.5).max(0.0);
        let i0 = (s.floor() as u32).min(max - 1);
        let i1 = (i0 + 1).min(max - 1);
        (i0, i1, s - i0 as f32)
    };
    let columnas: Vec<_> = (0..w).map(|x| muestras(x, sw, img.width())).collect();
    for y in 0..h {
        let (y0, y1, fy) = muestras(y, sh, img.height());
        for (x, &(x0, x1, fx)) in columnas.iter().enumerate() {
            let (a, b) = (img.get_pixel(x0, y0).0, img.get_pixel(x1, y0).0);
            let (c, d) = (img.get_pixel(x0, y1).0, img.get_pixel(x1, y1).0);
            let i = ((oy + y) * lado + ox + x as u32) as usize;
            for k in 0..3 {
                let arriba = f32::from(a[k]) * (1.0 - fx) + f32::from(b[k]) * fx;
                let abajo = f32::from(c[k]) * (1.0 - fx) + f32::from(d[k]) * fx;
                t[k * plano + i] = (arriba * (1.0 - fy) + abajo * fy) / 255.0;
            }
        }
    }
    (t, lb)
}

/// Tensor NCHW normalizado para CLIP: lado corto a `lado` (bicúbico) y recorte central.
pub fn tensor_clip(img: &RgbImage, lado: u32, media: [f32; 3], desviacion: [f32; 3]) -> Vec<f32> {
    let escala = lado as f32 / img.width().min(img.height()) as f32;
    let w = ((img.width() as f32 * escala).round() as u32).max(lado);
    let h = ((img.height() as f32 * escala).round() as u32).max(lado);
    let reducida = image::imageops::resize(img, w, h, FilterType::CatmullRom);
    let recorte =
        image::imageops::crop_imm(&reducida, (w - lado) / 2, (h - lado) / 2, lado, lado).to_image();
    nchw(&recorte, |c, v| (v / 255.0 - media[c]) / desviacion[c])
}

fn nchw(img: &RgbImage, f: impl Fn(usize, f32) -> f32) -> Vec<f32> {
    let plano = (img.width() * img.height()) as usize;
    let mut t = vec![0.0; 3 * plano];
    for (i, p) in img.pixels().enumerate() {
        for c in 0..3 {
            t[c * plano + i] = f(c, f32::from(p.0[c]));
        }
    }
    t
}

#[cfg(test)]
mod tests {
    use image::Rgb;

    use super::*;

    #[test]
    fn letterbox_vertical() {
        // 810×1080 → escala 0.5926, 480×640, banda de 80 px a cada lado
        let lb = Letterbox::calcular(810, 1080, 640);
        assert!((lb.escala - 0.5926).abs() < 1e-3);
        assert_eq!((lb.pad_x, lb.pad_y), (80.0, 0.0));
        let (x, y) = lb.deshacer(80.0 + 240.0, 320.0);
        assert!((x - 405.0).abs() < 0.5 && (y - 540.0).abs() < 0.5);
    }

    #[test]
    fn tensores_con_la_forma_correcta() {
        let img = RgbImage::from_pixel(300, 200, Rgb([255, 0, 0]));
        let (t, _) = tensor_yolo(&img, 640);
        assert_eq!(t.len(), 3 * 640 * 640);
        // centro: rojo puro; esquina: gris de relleno
        let centro = 320 * 640 + 320;
        assert_eq!((t[centro], t[640 * 640 + centro]), (1.0, 0.0));
        assert!((t[0] - 114.0 / 255.0).abs() < 1e-6);

        let c = tensor_clip(&img, 224, [0.5; 3], [0.5; 3]);
        assert_eq!(c.len(), 3 * 224 * 224);
        assert!((c[0] - 1.0).abs() < 1e-5 && (c[224 * 224] + 1.0).abs() < 1e-5);
    }
}
