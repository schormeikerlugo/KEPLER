//! Detección en el iPhone: CoreML ejecuta YOLO26s (salida end-to-end
//! `[1, 300, 6]`: x1, y1, x2, y2 en píxeles de la entrada, confianza, clase)
//! y aquí se interpreta: deshacer el letterbox, filtrar, nombrar y elegir el
//! objetivo que guardará la captura rápida. La entrada es vertical (576×1024,
//! la proporción de la cámara) o cuadrada (640×640).

use kepler_core::coco;

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct Deteccion {
    /// Clase COCO (`person`, `bus`…).
    pub clase: String,
    /// Nombre en español.
    pub nombre: String,
    pub confianza: f32,
    /// Caja normalizada [0, 1] sobre la imagen original (origen arriba a la izquierda).
    pub x: f32,
    pub y: f32,
    pub ancho: f32,
    pub alto: f32,
}

/// Salida del modelo → detecciones sobre una imagen de `ancho`×`alto` (ya
/// orientada) que se escaló centrada dentro de la entrada de
/// `entrada_ancho`×`entrada_alto` (letterbox).
#[uniffi::export]
pub fn interpretar_yolo(
    salida: Vec<f32>,
    ancho: u32,
    alto: u32,
    entrada_ancho: u32,
    entrada_alto: u32,
    umbral: f32,
) -> Vec<Deteccion> {
    let (w, h) = (ancho.max(1) as f32, alto.max(1) as f32);
    let (ew, eh) = (entrada_ancho as f32, entrada_alto as f32);
    let escala = (ew / w).min(eh / h);
    let (dx, dy) = ((ew - w * escala) / 2.0, (eh - h * escala) / 2.0);
    let mut v: Vec<Deteccion> = salida
        .as_chunks::<6>()
        .0
        .iter()
        .filter(|f| f[4] >= umbral)
        .filter_map(|f| {
            let clase = coco::clase(f[5].round().max(0.0) as usize)?;
            let a = |px: f32, d: f32, lado: f32| ((px - d) / escala / lado).clamp(0.0, 1.0);
            let (x1, y1, x2, y2) = (
                a(f[0], dx, w),
                a(f[1], dy, h),
                a(f[2], dx, w),
                a(f[3], dy, h),
            );
            (x2 > x1 && y2 > y1).then(|| Deteccion {
                clase: clase.to_owned(),
                nombre: coco::nombre(clase).to_owned(),
                confianza: f[4],
                x: x1,
                y: y1,
                ancho: x2 - x1,
                alto: y2 - y1,
            })
        })
        .collect();
    v.sort_by(|a, b| b.confianza.total_cmp(&a.confianza));
    v
}

/// El objetivo de la captura rápida: confianza × tamaño, favoreciendo el centro
/// (lo que el explorador está encuadrando).
#[uniffi::export]
pub fn elegir_objetivo(detecciones: Vec<Deteccion>) -> Option<Deteccion> {
    let puntuar = |d: &Deteccion| {
        let (cx, cy) = (d.x + d.ancho / 2.0 - 0.5, d.y + d.alto / 2.0 - 0.5);
        let centro = 1.0 - (cx * cx + cy * cy).sqrt().min(0.7);
        d.confianza * (d.ancho * d.alto).sqrt() * centro
    };
    detecciones
        .into_iter()
        .max_by(|a, b| puntuar(a).total_cmp(&puntuar(b)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deshace_el_letterbox() {
        // Imagen 1080×1920 (vertical): escala 1/3, bandas de 140 px a los lados
        let salida = vec![
            140.0, 0.0, 500.0, 640.0, 0.9, 0.0, // persona: toda la imagen
            300.0, 300.0, 340.0, 340.0, 0.2, 5.0, // bajo el umbral
            0.0, 0.0, 10.0, 10.0, 0.8, 99.0, // clase inexistente
        ];
        let d = interpretar_yolo(salida, 1080, 1920, 640, 640, 0.4);
        assert_eq!(d.len(), 1);
        assert_eq!(
            (d[0].clase.as_str(), d[0].nombre.as_str()),
            ("person", "Persona")
        );
        assert!(
            (d[0].x, d[0].y) == (0.0, 0.0)
                && (d[0].ancho - 1.0).abs() < 1e-5
                && (d[0].alto - 1.0).abs() < 1e-5
        );
    }

    #[test]
    fn entrada_vertical_sin_relleno() {
        // 1080×1920 en 576×1024: escala exacta, sin bandas
        let d = interpretar_yolo(
            vec![288.0, 512.0, 576.0, 1024.0, 0.8, 39.0],
            1080,
            1920,
            576,
            1024,
            0.4,
        );
        assert_eq!(d[0].nombre, "Botella");
        for v in [d[0].x, d[0].y, d[0].ancho, d[0].alto] {
            assert!((v - 0.5).abs() < 1e-5, "{v}");
        }
    }

    #[test]
    fn objetivo_centrado_antes_que_el_del_borde() {
        let caja = |x: f32, conf: f32| Deteccion {
            clase: "bottle".into(),
            nombre: "Botella".into(),
            confianza: conf,
            x,
            y: 0.4,
            ancho: 0.2,
            alto: 0.2,
        };
        let o = elegir_objetivo(vec![caja(0.0, 0.9), caja(0.4, 0.7)]).unwrap();
        assert_eq!(o.x, 0.4);
        assert!(elegir_objetivo(vec![]).is_none());
    }
}
