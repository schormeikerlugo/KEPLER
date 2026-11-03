//! Prompts de la v0.7 que no son chat: descripción de la zona de una misión
//! (lugar, terreno y dificultad) y descripción de un objeto capturado sin ella.
//! Se rellenan en segundo plano y solo si faltan: nunca pisan lo que puso el
//! explorador.

use axum::Json;
use axum::extract::State;
use kepler_ai::Mensaje;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;

const TERRENOS: &[&str] = &["llano", "asfalto", "tierra", "barro", "rocoso", "montana"];
const DIFICULTADES: &[&str] = &["baja", "moderada", "alta"];

/// Primer objeto JSON de una respuesta del modelo (puede venir con texto alrededor).
fn json_de(texto: &str) -> Option<Value> {
    let (i, j) = (texto.find('{')?, texto.rfind('}')?);
    serde_json::from_str(texto.get(i..=j)?).ok()
}

/// Lugar (geocodificación inversa) y, con el modelo, descripción, terreno y
/// dificultad típicos. Sin modelo, solo el lugar.
pub async fn describir(estado: &Estado, lat: f64, lng: f64) -> Value {
    let lugar = estado.externos.lugar(lat, lng).await;
    let donde = lugar
        .clone()
        .unwrap_or_else(|| format!("{lat:.4}, {lng:.4}"));
    let pedido = format!(
        "Eres el asistente de un explorador de campo. Describe la zona {donde} (coordenadas {lat:.4}, {lng:.4}). \
         Responde SOLO con JSON: {{\"descripcion\": \"2-3 frases en español sobre terreno, clima y flora/fauna \
         típicos\", \"terreno\": uno de {TERRENOS:?}, \"dificultad\": uno de {DIFICULTADES:?}}}"
    );
    let respuesta = estado.ia.completar(&[Mensaje::usuario(pedido)]).await.ok();
    let v = respuesta
        .as_deref()
        .and_then(json_de)
        .unwrap_or(Value::Null);
    let elegir = |k: &str, opciones: &[&str]| {
        v[k].as_str()
            .map(|s| s.trim().to_lowercase().replace('ñ', "n"))
            .filter(|s| opciones.contains(&s.as_str()))
    };
    json!({
        "zona": lugar,
        "descripcion": v["descripcion"].as_str().map(str::trim).filter(|s| !s.is_empty()),
        "terreno": elegir("terreno", TERRENOS),
        "dificultad": elegir("dificultad", DIFICULTADES),
    })
}

#[derive(Debug, Deserialize)]
pub struct PeticionZona {
    lat: f64,
    lng: f64,
}

/// `POST /v1/ia/zona` — `{zona, descripcion, terreno, dificultad}` de unas coordenadas.
pub async fn zona(
    State(estado): State<Estado>,
    _sesion: Sesion,
    Json(p): Json<PeticionZona>,
) -> ApiResult<Json<Value>> {
    kepler_core::Coordenada::new(p.lat, p.lng).map_err(|e| ApiError::Invalido(e.to_string()))?;
    Ok(Json(describir(&estado, p.lat, p.lng).await))
}

/// Tras crear una misión con posición: zona, terreno y dificultad si faltan.
pub fn completar_mision(estado: Estado, sesion: Sesion, id: Uuid, lat: f64, lng: f64) {
    tokio::spawn(async move {
        let d = describir(&estado, lat, lng).await;
        let r = async {
            let mut tx = estado.db.como_usuario(&sesion).await?;
            sqlx::query(
                "update public.misiones set
                    zona = coalesce(zona, $2), tipo_terreno = coalesce(tipo_terreno, $3),
                    dificultad = coalesce(dificultad, $4)
                 where id = $1 and (zona is null or tipo_terreno is null or dificultad is null)",
            )
            .bind(id)
            .bind(d["zona"].as_str())
            .bind(d["terreno"].as_str())
            .bind(d["dificultad"].as_str())
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            Ok::<_, ApiError>(())
        };
        if let Err(e) = r.await {
            tracing::warn!(mision = %id, error = %e, "zona: no se pudo completar");
        }
    });
}

/// Tras guardar un objeto sin descripción: una útil para buscarlo después.
pub fn describir_objeto(estado: Estado, sesion: Sesion, id: Uuid) {
    tokio::spawn(async move {
        let r = async {
            let mut tx = estado.db.como_usuario(&sesion).await?;
            let datos: Option<Value> = sqlx::query_scalar(
                "select jsonb_build_object('nombre', o.nombre, 'clase', o.clase_yolo, 'categoria', c.nombre,
                        'subcategoria', s.nombre,
                        'etiquetas', (select coalesce(jsonb_agg(e.nombre), '[]') from public.objeto_etiquetas oe
                                      join public.etiquetas e on e.id = oe.etiqueta_id where oe.objeto_id = o.id))
                 from public.objetos o
                 left join public.categorias c on c.id = o.categoria_id
                 left join public.subcategorias s on s.id = o.subcategoria_id
                 where o.id = $1 and coalesce(o.descripcion, '') = ''",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
            tx.commit().await?;
            let Some(d) = datos else { return Ok(()) };
            let clase = d["clase"]
                .as_str()
                .map(kepler_core::coco::nombre)
                .unwrap_or_default();
            let pedido = format!(
                "Genera una descripción útil y concisa (español, 1-2 frases, para encontrarlo en búsquedas \
                 futuras) de este objeto registrado por un explorador de campo. Nombre: {}. Tipo detectado: {clase}. \
                 Categoría: {}. Subcategoría: {}. Etiquetas: {}. No repitas la categoría literalmente. Responde \
                 SOLO con la descripción.",
                d["nombre"].as_str().unwrap_or_default(),
                d["categoria"].as_str().unwrap_or("—"),
                d["subcategoria"].as_str().unwrap_or("—"),
                d["etiquetas"]
            );
            let texto = estado
                .ia
                .completar(&[Mensaje::usuario(pedido)])
                .await
                .map_err(|e| ApiError::Interno(e.to_string()))?;
            let texto: String = texto.trim().trim_matches('"').chars().take(400).collect();
            if texto.is_empty() {
                return Ok(());
            }
            let mut tx = estado.db.como_usuario(&sesion).await?;
            sqlx::query("update public.objetos set descripcion = $2 where id = $1 and coalesce(descripcion, '') = ''")
                .bind(id)
                .bind(texto)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            Ok::<_, ApiError>(())
        };
        if let Err(e) = r.await {
            tracing::warn!(objeto = %id, error = %e, "descripción de objeto: no se pudo generar");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extrae_json_de_la_respuesta() {
        let v =
            json_de("Claro:\n{\"terreno\": \"montana\", \"dificultad\": \"alta\"}\nListo").unwrap();
        assert_eq!(v["terreno"], "montana");
        assert!(json_de("sin json").is_none());
    }
}
