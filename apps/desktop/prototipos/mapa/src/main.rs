//! Prueba de MapLibre Native: estilo Odradek + PMTiles local, render estático a PNG.
use std::num::NonZeroU32;
use std::time::Instant;

use maplibre_native::{CameraUpdate, ImageRendererBuilder, LatLng};

fn main() {
    let estilo_ruta = std::env::args().nth(1).expect("estilo.json");
    let mut r = ImageRendererBuilder::new()
        .with_size(NonZeroU32::new(1200).unwrap(), NonZeroU32::new(800).unwrap())
        .build_static_renderer();
    let t = Instant::now();
    r.load_style_from_path(&estilo_ruta).expect("leer estilo").wait().expect("estilo");
    println!("estilo: {:?}", t.elapsed());
    for (i, (lat, lng, z)) in [(10.49, -66.88, 12.0), (10.50, -66.90, 15.0), (10.48, -66.87, 15.5)].into_iter().enumerate() {
        let t = Instant::now();
        let img = r
            .render_static(&CameraUpdate::new().center(LatLng { lat, lng }).zoom(z))
            .expect("render");
        println!("render {i} z{z}: {:?}", t.elapsed());
        img.as_image().save(format!("/tmp/mln/mapa{i}.png")).unwrap();
    }
}
