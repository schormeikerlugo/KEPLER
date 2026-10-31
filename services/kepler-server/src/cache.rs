//! Caché en memoria con caducidad, para respuestas de servicios externos.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct Cache<V> {
    ttl: Duration,
    capacidad: usize,
    entradas: Mutex<HashMap<String, (Instant, V)>>,
}

impl<V: Clone> Cache<V> {
    pub fn new(ttl: Duration, capacidad: usize) -> Self {
        Self {
            ttl,
            capacidad,
            entradas: Mutex::new(HashMap::new()),
        }
    }

    pub fn obtener(&self, clave: &str) -> Option<V> {
        let entradas = self.entradas.lock().expect("cache");
        entradas
            .get(clave)
            .filter(|(guardado, _)| guardado.elapsed() < self.ttl)
            .map(|(_, v)| v.clone())
    }

    pub fn guardar(&self, clave: String, valor: V) {
        let mut entradas = self.entradas.lock().expect("cache");
        if entradas.len() >= self.capacidad {
            let ttl = self.ttl;
            entradas.retain(|_, (guardado, _)| guardado.elapsed() < ttl);
            if entradas.len() >= self.capacidad {
                entradas.clear();
            }
        }
        entradas.insert(clave, (Instant::now(), valor));
    }
}

/// Clave por coordenada redondeada (2 decimales ≈ 1 km).
pub fn clave_coordenada(lat: f64, lng: f64) -> String {
    format!("{lat:.2},{lng:.2}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caduca_y_respeta_capacidad() {
        let c = Cache::new(Duration::from_millis(30), 2);
        c.guardar("a".into(), 1);
        assert_eq!(c.obtener("a"), Some(1));
        std::thread::sleep(Duration::from_millis(40));
        assert_eq!(c.obtener("a"), None);

        c.guardar("x".into(), 1);
        c.guardar("y".into(), 2);
        c.guardar("z".into(), 3);
        assert_eq!(c.obtener("z"), Some(3));
        assert!(c.entradas.lock().unwrap().len() <= 2);
    }

    #[test]
    fn coordenadas_cercanas_comparten_clave() {
        assert_eq!(
            clave_coordenada(10.4806, -66.9036),
            clave_coordenada(10.4831, -66.9011)
        );
        assert_ne!(
            clave_coordenada(10.48, -66.90),
            clave_coordenada(10.50, -66.90)
        );
    }
}
