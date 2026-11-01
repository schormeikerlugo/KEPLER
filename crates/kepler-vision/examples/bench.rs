//! Mide la latencia de los modelos en esta máquina.
//!   cargo run --release -p kepler-vision --example bench -- models/onnx [hilos]

use std::time::Instant;

use kepler_vision::{Modelos, Rastreador, decodificar};

fn medir(nombre: &str, n: usize, mut f: impl FnMut()) {
    f(); // calentamiento
    let mut t: Vec<f64> = (0..n)
        .map(|_| {
            let i = Instant::now();
            f();
            i.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    t.sort_by(f64::total_cmp);
    println!(
        "{nombre:<34} p50 {:>6.1} ms   p95 {:>6.1} ms",
        t[n / 2],
        t[n * 95 / 100]
    );
}

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = args.next().unwrap_or_else(|| "models/onnx".into());
    let hilos: usize = args
        .next()
        .and_then(|h| h.parse().ok())
        .unwrap_or(kepler_vision::HILOS_POR_DEFECTO);
    let m = Modelos::cargar(&dir, hilos).expect("modelos");
    let jpeg = std::fs::read(m.dir.join("prueba-bus.jpg")).unwrap();
    let img = decodificar(&jpeg).unwrap();
    println!("{} hilos · imagen {}×{}", hilos, img.width(), img.height());

    medir("decodificar JPEG", 50, || {
        decodificar(&jpeg).unwrap();
    });
    medir("YOLO26n (incluye preprocesado)", 50, || {
        m.detector.detectar(&img, 0.25).unwrap();
    });
    let mut r = Rastreador::default();
    let dets = m.detector.detectar(&img, 0.25).unwrap();
    medir("ByteTrack", 200, || {
        r.actualizar(dets.clone());
    });
    medir("CLIP 1 imagen", 30, || {
        m.embebedor.embedding(&img).unwrap();
    });
    let lote = vec![img.clone(); 5];
    medir("CLIP lote de 5", 15, || {
        m.embebedor.lote(&lote).unwrap();
    });
}
