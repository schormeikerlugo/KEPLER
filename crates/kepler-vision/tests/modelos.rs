//! Pruebas con los modelos exportados. Se omiten si no existen:
//!   KEPLER_MODELOS=models/onnx cargo test -p kepler-vision

use kepler_vision::{Modelos, Rastreador, decodificar};

fn modelos() -> Option<Modelos> {
    let dir = std::env::var("KEPLER_MODELOS").ok()?;
    Some(Modelos::cargar(&dir, 4).expect("cargar modelos"))
}

#[test]
fn yolo_coincide_con_ultralytics() {
    let Some(m) = modelos() else {
        return eprintln!("sin KEPLER_MODELOS: omitido");
    };
    let img = decodificar(&std::fs::read(m.dir.join("prueba-bus.jpg")).unwrap()).unwrap();
    let dets = m.detector.detectar(&img, 0.5).unwrap();
    // Ultralytics: bus 0.93 [6,229,807,749] y 4 personas
    let clases: Vec<&str> = dets.iter().map(|d| d.clase.as_str()).collect();
    assert_eq!(
        clases.iter().filter(|c| **c == "person").count(),
        4,
        "{clases:?}"
    );
    let bus = dets.iter().find(|d| d.clase == "bus").expect("bus");
    assert!((bus.confianza - 0.93).abs() < 0.03, "{}", bus.confianza);
    let (w, h) = (img.width() as f32, img.height() as f32);
    let x1 = bus.caja.x * w;
    let y2 = (bus.caja.y + bus.caja.alto) * h;
    assert!(
        (x1 - 6.0).abs() < 10.0 && (y2 - 749.0).abs() < 10.0,
        "x1 {x1} y2 {y2}"
    );
}

#[test]
fn clip_coincide_con_la_v07() {
    let Some(m) = modelos() else { return };
    let img = decodificar(&std::fs::read(m.dir.join("referencia.png")).unwrap()).unwrap();
    let e = m.embebedor.embedding(&img).unwrap();
    assert_eq!(e.len(), 512);
    let norma: f32 = e.iter().map(|v| v * v).sum::<f32>().sqrt();
    assert!((norma - 1.0).abs() < 1e-4);
    let referencia = &m.meta.clip.referencia;
    assert_eq!(referencia.len(), 512);
    let coseno: f32 = e.iter().zip(referencia).map(|(a, b)| a * b).sum();
    assert!(
        coseno > 0.99,
        "similitud con sentence-transformers: {coseno}"
    );
}

#[test]
fn rastreo_sobre_fotogramas_reales() {
    let Some(m) = modelos() else { return };
    let img = decodificar(&std::fs::read(m.dir.join("prueba-bus.jpg")).unwrap()).unwrap();
    let mut r = Rastreador::default();
    let mut primero: Vec<u32> = r
        .actualizar(m.detector.detectar(&img, 0.25).unwrap())
        .iter()
        .map(|x| x.track_id)
        .collect();
    let mut segundo: Vec<u32> = r
        .actualizar(m.detector.detectar(&img, 0.25).unwrap())
        .iter()
        .map(|x| x.track_id)
        .collect();
    primero.sort();
    segundo.sort();
    assert!(!primero.is_empty());
    assert_eq!(primero, segundo);
}
