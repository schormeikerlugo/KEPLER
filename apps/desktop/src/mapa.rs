//! Mapa con MapLibre Native: estilo Odradek sobre PMTiles locales (offline) y
//! capas propias en GeoJSON. MapLibre renderiza en su propio hilo (no es `Send`)
//! a una imagen que la UI muestra; la cámara la lleva Rust (Web Mercator).

use std::f64::consts::PI;
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender, channel};

use maplibre_native::{CameraUpdate, GeoJson, ImageRendererBuilder, LatLng, Size, SourceRefMut};
use slint::{Rgba8Pixel, SharedPixelBuffer};

/// Lado de tesela de MapLibre: el mundo mide 512·2^zoom píxeles.
const TESELA: f64 = 512.0;
pub const ZOOM_MIN: f64 = 3.0;
pub const ZOOM_MAX: f64 = 19.0;
const LAT_MAX: f64 = 85.051_128_78;

/// Posición de la cámara.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Camara {
    pub lat: f64,
    pub lng: f64,
    pub zoom: f64,
}

impl Camara {
    fn mundo(&self) -> f64 {
        TESELA * 2f64.powf(self.zoom)
    }

    /// Píxel (global, al zoom actual) de una coordenada.
    pub fn proyectar(&self, lat: f64, lng: f64) -> (f64, f64) {
        let w = self.mundo();
        let lat = lat.clamp(-LAT_MAX, LAT_MAX).to_radians();
        let x = (lng + 180.0) / 360.0 * w;
        let y = (1.0 - (lat.tan() + 1.0 / lat.cos()).ln() / PI) / 2.0 * w;
        (x, y)
    }

    pub fn desproyectar(&self, x: f64, y: f64) -> (f64, f64) {
        let w = self.mundo();
        let lng = x / w * 360.0 - 180.0;
        let lat = (PI * (1.0 - 2.0 * y / w)).sinh().atan().to_degrees();
        (lat.clamp(-LAT_MAX, LAT_MAX), lng)
    }

    /// Posición en la vista (`ancho`×`alto`, origen arriba a la izquierda).
    pub fn en_vista(&self, lat: f64, lng: f64, ancho: f64, alto: f64) -> (f64, f64) {
        let (cx, cy) = self.proyectar(self.lat, self.lng);
        let (x, y) = self.proyectar(lat, lng);
        (x - cx + ancho / 2.0, y - cy + alto / 2.0)
    }

    /// Arrastrar la vista `dx`, `dy` píxeles (el mapa sigue al cursor).
    pub fn mover(&mut self, dx: f64, dy: f64) {
        let (cx, cy) = self.proyectar(self.lat, self.lng);
        (self.lat, self.lng) = self.desproyectar(cx - dx, cy - dy);
        self.lng = (self.lng + 540.0).rem_euclid(360.0) - 180.0;
    }

    /// Zoom manteniendo fijo el punto bajo (`px`, `py`) de una vista `ancho`×`alto`.
    pub fn acercar(&mut self, delta: f64, px: f64, py: f64, ancho: f64, alto: f64) {
        let (cx, cy) = self.proyectar(self.lat, self.lng);
        let (lat, lng) = self.desproyectar(cx + px - ancho / 2.0, cy + py - alto / 2.0);
        self.zoom = (self.zoom + delta).clamp(ZOOM_MIN, ZOOM_MAX);
        let (x, y) = self.proyectar(lat, lng);
        (self.lat, self.lng) = self.desproyectar(x - px + ancho / 2.0, y - py + alto / 2.0);
    }
}

pub enum Orden {
    Tamano(u32, u32),
    Camara(Camara),
    Elementos(String),
    Rastro(String),
    /// Posición y recorrido de las Unidades de Campo en vivo.
    Unidades(String),
    /// Ruta que se está planificando.
    Plan(String),
}

pub type Fotograma = SharedPixelBuffer<Rgba8Pixel>;

/// Hilo de render: aplica las órdenes pendientes y dibuja solo el último estado.
pub fn lanzar(
    pmtiles: &Path,
    datos: &Path,
    al_dibujar: impl Fn(Fotograma) + Send + 'static,
    al_fallar: impl Fn(String) + Send + 'static,
) -> Sender<Orden> {
    let (tx, rx) = channel();
    let estilo = kepler_mapa::preparar_estilo(pmtiles, datos);
    std::thread::Builder::new()
        .name("mapa".into())
        .spawn(move || match estilo {
            Ok(e) => bucle(&e, &rx, &al_dibujar, &al_fallar),
            Err(e) => al_fallar(e),
        })
        .expect("hilo del mapa");
    tx
}

fn bucle(
    estilo: &str,
    rx: &Receiver<Orden>,
    al_dibujar: &impl Fn(Fotograma),
    al_fallar: &impl Fn(String),
) {
    let mut tamano = (800u32, 600u32);
    let mut r = ImageRendererBuilder::new()
        .with_size(
            NonZeroU32::new(tamano.0).unwrap(),
            NonZeroU32::new(tamano.1).unwrap(),
        )
        .build_static_renderer();
    let carga = r
        .load_style_from_json_str(estilo)
        .wait()
        .map_err(|e| format!("estilo del mapa: {e}"));
    if let Err(e) = carga {
        al_fallar(e);
        return;
    }
    let mut camara = None;
    // Espera una orden y junta las que lleguen detrás (p. ej. un arrastre rápido)
    while let Ok(primera) = rx.recv() {
        for orden in std::iter::once(primera).chain(rx.try_iter()) {
            match orden {
                Orden::Tamano(w, h) if (w, h) != tamano && w > 0 && h > 0 => {
                    tamano = (w, h);
                    r.set_map_size(Size {
                        width: w,
                        height: h,
                    });
                }
                Orden::Tamano(..) => {}
                Orden::Camara(c) => camara = Some(c),
                Orden::Elementos(g) => poner_geojson(&mut r, "kepler", &g),
                Orden::Rastro(g) => poner_geojson(&mut r, "rastro", &g),
                Orden::Unidades(g) => poner_geojson(&mut r, "unidades", &g),
                Orden::Plan(g) => poner_geojson(&mut r, "plan", &g),
            }
        }
        let Some(c) = camara else { continue };
        let vista = CameraUpdate::new()
            .center(LatLng {
                lat: c.lat,
                lng: c.lng,
            })
            .zoom(c.zoom);
        match r.render_static(&vista) {
            Ok(img) => {
                let b = img.as_image();
                al_dibujar(SharedPixelBuffer::clone_from_slice(
                    b.as_raw(),
                    b.width(),
                    b.height(),
                ));
            }
            Err(e) => al_fallar(format!("render: {e}")),
        }
    }
}

fn poner_geojson<S>(r: &mut maplibre_native::ImageRenderer<S>, fuente: &str, geojson: &str) {
    let Ok(g) = GeoJson::from_json_str(geojson) else {
        return;
    };
    if let Some(SourceRefMut::GeoJson(mut s)) = r.style().source_mut(fuente) {
        s.set_geojson(&g);
    }
}

/// Directorio de datos de la app (mapas, glifos).
pub fn directorio_datos() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .unwrap_or_else(std::env::temp_dir)
        .join("kepler")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cerca(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    #[test]
    fn proyeccion_ida_y_vuelta() {
        let c = Camara {
            lat: 10.49,
            lng: -66.88,
            zoom: 12.0,
        };
        let (x, y) = c.proyectar(10.49, -66.88);
        let (lat, lng) = c.desproyectar(x, y);
        assert!(cerca(lat, 10.49) && cerca(lng, -66.88));
        // El centro cae en el centro de la vista
        let (vx, vy) = c.en_vista(10.49, -66.88, 800.0, 600.0);
        assert!(cerca(vx, 400.0) && cerca(vy, 300.0));
    }

    #[test]
    fn arrastrar_y_acercar_bajo_el_cursor() {
        let mut c = Camara {
            lat: 10.49,
            lng: -66.88,
            zoom: 12.0,
        };
        let antes = c.en_vista(10.5, -66.9, 800.0, 600.0);
        c.mover(30.0, -20.0);
        let despues = c.en_vista(10.5, -66.9, 800.0, 600.0);
        assert!(cerca(despues.0 - antes.0, 30.0) && cerca(despues.1 - antes.1, -20.0));

        // El punto bajo el cursor no se mueve al hacer zoom
        let (px, py) = (200.0, 150.0);
        let c0 = c;
        let (cx, cy) = c0.proyectar(c0.lat, c0.lng);
        let (lat, lng) = c0.desproyectar(cx + px - 400.0, cy + py - 300.0);
        c.acercar(1.5, px, py, 800.0, 600.0);
        let (x, y) = c.en_vista(lat, lng, 800.0, 600.0);
        assert!((x - px).abs() < 1e-3 && (y - py).abs() < 1e-3);
        assert!(cerca(c.zoom, 13.5));
    }
}
