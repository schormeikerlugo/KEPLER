//! Cortex en el iPhone: chat con la IA local (streaming NDJSON) y Deep-Dive de
//! la bitácora. El núcleo acumula el texto (y descarta el borrador cuando la IA
//! decide usar herramientas) y avisa a Swift con el texto completo.

use std::sync::Arc;

use serde_json::Value;

/// Lo implementa Swift: recibe el avance de una respuesta de Cortex.
#[uniffi::export(with_foreign)]
pub trait OyenteCortex: Send + Sync {
    /// Qué está haciendo («Consultando misiones…»).
    fn estado(&self, texto: String);
    /// La respuesta hasta ahora (completa, no el último trozo).
    fn texto(&self, acumulado: String);
    /// Fotos de hallazgos que Cortex muestra (`mostrar_imagenes`), todas las de la respuesta.
    fn imagenes(&self, todas: Vec<ImagenCortex>);
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ImagenCortex {
    pub id: String,
    /// `objeto`, `persona` o `poi`.
    pub tipo: String,
    pub nombre: String,
    pub imagen_path: String,
    pub capturado_en: i64,
}

fn imagen(v: &Value) -> Option<ImagenCortex> {
    Some(ImagenCortex {
        id: v["id"].as_str()?.to_owned(),
        tipo: v["tipo"].as_str().unwrap_or("objeto").to_owned(),
        nombre: v["nombre"].as_str().unwrap_or_default().to_owned(),
        imagen_path: v["imagen_path"].as_str()?.to_owned(),
        capturado_en: crate::archivo::segundos(&v["capturado_en"]),
    })
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ChatResumen {
    pub id: String,
    pub titulo: String,
    pub actualizado_en: i64,
    pub mensajes: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct MensajeCortex {
    /// `user` o `assistant`.
    pub rol: String,
    pub texto: String,
    pub en: i64,
    pub imagenes: Vec<ImagenCortex>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct FinCortex {
    pub texto: String,
    /// Chat (nuevo o el mismo); `None` en un Deep-Dive.
    pub chat_id: Option<String>,
    pub titulo: Option<String>,
    pub segundos: f64,
    pub imagenes: Vec<ImagenCortex>,
}

/// Procesa los eventos del streaming; devuelve el final o el error de la IA.
pub struct Acumulador {
    oyente: Arc<dyn OyenteCortex>,
    texto: String,
    imagenes: Vec<ImagenCortex>,
    fin: Option<Value>,
    error: Option<String>,
}

impl Acumulador {
    pub fn new(oyente: Arc<dyn OyenteCortex>) -> Self {
        Self {
            oyente,
            texto: String::new(),
            imagenes: Vec::new(),
            fin: None,
            error: None,
        }
    }

    pub fn evento(&mut self, ev: Value) {
        match ev["tipo"].as_str() {
            Some("token") => {
                self.texto
                    .push_str(ev["texto"].as_str().unwrap_or_default());
                self.oyente.texto(self.texto.clone());
            }
            Some("reiniciar") => {
                self.texto.clear();
                self.oyente.texto(String::new());
            }
            Some("imagenes") => {
                self.imagenes.extend(
                    ev["items"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(imagen),
                );
                self.oyente.imagenes(self.imagenes.clone());
            }
            Some("estado") => self
                .oyente
                .estado(ev["texto"].as_str().unwrap_or_default().to_owned()),
            Some("error") => {
                self.error = Some(ev["texto"].as_str().unwrap_or("error de la IA").to_owned())
            }
            Some("fin") => self.fin = Some(ev),
            _ => {}
        }
    }

    pub fn terminar(self) -> Result<FinCortex, String> {
        if let Some(e) = self.error {
            return Err(e);
        }
        let fin = self.fin.ok_or("la respuesta se cortó")?;
        Ok(FinCortex {
            texto: self.texto.trim().to_owned(),
            chat_id: fin["chat_id"].as_str().map(str::to_owned),
            titulo: fin["titulo"]
                .as_str()
                .filter(|t| !t.is_empty())
                .map(str::to_owned),
            segundos: fin["segundos"].as_f64().unwrap_or(0.0),
            imagenes: self.imagenes,
        })
    }
}

pub fn resumen(v: &Value) -> ChatResumen {
    ChatResumen {
        id: v["id"].as_str().unwrap_or_default().to_owned(),
        titulo: v["titulo"]
            .as_str()
            .filter(|t| !t.is_empty())
            .unwrap_or("Conversación")
            .to_owned(),
        actualizado_en: crate::archivo::segundos(&v["actualizado_en"]),
        mensajes: u32::try_from(v["mensajes"].as_u64().unwrap_or(0)).unwrap_or(0),
    }
}

pub fn mensajes(chat: &Value) -> Vec<MensajeCortex> {
    chat["mensajes"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|m| MensajeCortex {
            rol: m["rol"].as_str().unwrap_or("assistant").to_owned(),
            texto: m["contenido"].as_str().unwrap_or_default().to_owned(),
            en: crate::archivo::segundos(&m["en"]),
            imagenes: m["imagenes"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(imagen)
                .collect(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use serde_json::json;

    use super::*;

    #[derive(Default)]
    struct Registro(Mutex<Vec<String>>);

    impl OyenteCortex for Registro {
        fn estado(&self, texto: String) {
            self.0.lock().unwrap().push(format!("estado:{texto}"));
        }
        fn texto(&self, acumulado: String) {
            self.0.lock().unwrap().push(format!("texto:{acumulado}"));
        }
        fn imagenes(&self, todas: Vec<ImagenCortex>) {
            self.0
                .lock()
                .unwrap()
                .push(format!("imagenes:{}", todas.len()));
        }
    }

    #[test]
    fn borrador_descartado_y_final() {
        let r = Arc::new(Registro::default());
        let mut a = Acumulador::new(r.clone());
        for ev in [
            json!({ "tipo": "estado", "texto": "Cortex está pensando…" }),
            json!({ "tipo": "token", "texto": "Voy a mirar" }),
            json!({ "tipo": "reiniciar" }),
            json!({ "tipo": "token", "texto": "Tienes " }),
            json!({ "tipo": "token", "texto": "2 misiones" }),
            json!({ "tipo": "imagenes", "items": [{ "id": "o", "tipo": "objeto", "nombre": "Autobús", "imagen_path": "u/o.jpg" },
                                                   { "id": "sin_foto" }] }),
            json!({ "tipo": "fin", "chat_id": "c", "titulo": "🗺️ Misiones", "segundos": 5.5 }),
        ] {
            a.evento(ev);
        }
        assert!(
            r.0.lock()
                .unwrap()
                .contains(&"texto:Tienes 2 misiones".to_owned())
        );
        assert_eq!(r.0.lock().unwrap().last().unwrap(), "imagenes:1");
        let f = a.terminar().unwrap();
        assert_eq!(f.imagenes[0].nombre, "Autobús");
        assert_eq!(
            (f.texto.as_str(), f.chat_id.as_deref(), f.segundos),
            ("Tienes 2 misiones", Some("c"), 5.5)
        );
    }

    #[test]
    fn error_o_corte() {
        let mut a = Acumulador::new(Arc::new(Registro::default()));
        a.evento(json!({ "tipo": "error", "texto": "ningún servidor de IA disponible" }));
        assert!(a.terminar().unwrap_err().contains("IA"));
        assert!(
            Acumulador::new(Arc::new(Registro::default()))
                .terminar()
                .is_err()
        );
    }
}
