//! Reparto en vivo entre las conexiones de un mismo usuario.
//!
//! Un canal `broadcast` por usuario: las unidades de campo publican y los
//! centros de control (y las demás sesiones) reciben. Si un receptor se
//! atrasa pierde los mensajes viejos, que en vivo ya no sirven.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use tokio::sync::broadcast;
use uuid::Uuid;

const CAPACIDAD: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Clase {
    /// JPEG: solo a quien se suscribió con `fotogramas = true`.
    Fotograma,
    Otro,
}

#[derive(Debug)]
pub struct Relevo {
    /// Sesión que lo originó (`None` = el propio servidor, p. ej. eventos de misión).
    pub origen: Option<Uuid>,
    pub clase: Clase,
    /// Envoltura ya codificada.
    pub bytes: Vec<u8>,
}

#[derive(Default)]
pub struct Difusor {
    canales: Mutex<HashMap<Uuid, broadcast::Sender<std::sync::Arc<Relevo>>>>,
    sesiones: AtomicUsize,
}

impl Difusor {
    pub fn suscribir(&self, user_id: Uuid) -> broadcast::Receiver<std::sync::Arc<Relevo>> {
        self.sesiones.fetch_add(1, Ordering::Relaxed);
        self.canales
            .lock()
            .expect("difusor")
            .entry(user_id)
            .or_insert_with(|| broadcast::channel(CAPACIDAD).0)
            .subscribe()
    }

    /// Llamar al cerrar una conexión (después de soltar su receptor).
    pub fn desuscribir(&self, user_id: Uuid) {
        self.sesiones.fetch_sub(1, Ordering::Relaxed);
        let mut canales = self.canales.lock().expect("difusor");
        if canales
            .get(&user_id)
            .is_some_and(|tx| tx.receiver_count() == 0)
        {
            canales.remove(&user_id);
        }
    }

    pub fn publicar(&self, user_id: Uuid, relevo: Relevo) {
        if let Some(tx) = self.canales.lock().expect("difusor").get(&user_id) {
            let _ = tx.send(std::sync::Arc::new(relevo));
        }
    }

    pub fn sesiones(&self) -> usize {
        self.sesiones.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reparte_solo_al_mismo_usuario() {
        let d = Difusor::default();
        let (yo, otro) = (Uuid::now_v7(), Uuid::now_v7());
        let mut rx_yo = d.suscribir(yo);
        let mut rx_otro = d.suscribir(otro);
        assert_eq!(d.sesiones(), 2);

        d.publicar(
            yo,
            Relevo {
                origen: None,
                clase: Clase::Otro,
                bytes: vec![1, 2],
            },
        );
        assert_eq!(rx_yo.recv().await.unwrap().bytes, vec![1, 2]);
        assert!(rx_otro.try_recv().is_err());

        drop(rx_yo);
        d.desuscribir(yo);
        assert_eq!(d.sesiones(), 1);
        assert!(!d.canales.lock().unwrap().contains_key(&yo));
        drop(rx_otro);
        d.desuscribir(otro);
    }
}
