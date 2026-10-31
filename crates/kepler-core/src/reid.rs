//! Re-identificación visual con embeddings CLIP (512 dimensiones).
//!
//! En el servidor la búsqueda la hace pgvector (`buscar_similares`); estas
//! funciones sirven para el Re-ID offline contra la caché del dispositivo.

use uuid::Uuid;

use crate::{Error, Resultado};

pub const DIMENSION_EMBEDDING: usize = 512;

/// Similitud mínima para considerar que dos capturas son la misma entidad.
pub const UMBRAL_REID: f32 = 0.78;

pub fn validar_dimension(embedding: &[f32]) -> Resultado<()> {
    if embedding.len() == DIMENSION_EMBEDDING {
        Ok(())
    } else {
        Err(Error::DimensionEmbedding(embedding.len()))
    }
}

/// Similitud de coseno en [-1, 1]. `None` si las longitudes difieren o algún vector es nulo.
pub fn similitud_coseno(a: &[f32], b: &[f32]) -> Option<f32> {
    if a.len() != b.len() || a.is_empty() {
        return None;
    }
    let (mut punto, mut na, mut nb) = (0.0f32, 0.0f32, 0.0f32);
    for (x, y) in a.iter().zip(b) {
        punto += x * y;
        na += x * x;
        nb += y * y;
    }
    let denominador = (na * nb).sqrt();
    (denominador > 0.0).then(|| punto / denominador)
}

/// Mejor candidato con similitud ≥ `umbral`.
pub fn mejor_coincidencia<'a>(
    consulta: &[f32],
    candidatos: impl IntoIterator<Item = (Uuid, &'a [f32])>,
    umbral: f32,
) -> Option<(Uuid, f32)> {
    candidatos
        .into_iter()
        .filter_map(|(id, e)| similitud_coseno(consulta, e).map(|s| (id, s)))
        .filter(|&(_, s)| s >= umbral)
        .max_by(|a, b| a.1.total_cmp(&b.1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coseno_basico() {
        assert_eq!(similitud_coseno(&[1.0, 0.0], &[1.0, 0.0]), Some(1.0));
        assert_eq!(similitud_coseno(&[1.0, 0.0], &[0.0, 1.0]), Some(0.0));
        assert_eq!(similitud_coseno(&[1.0], &[1.0, 0.0]), None);
        assert_eq!(similitud_coseno(&[0.0, 0.0], &[1.0, 0.0]), None);
    }

    #[test]
    fn elige_el_mejor_sobre_el_umbral() {
        let consulta = [1.0, 0.0, 0.0];
        let (a, b, c) = (Uuid::from_u128(1), Uuid::from_u128(2), Uuid::from_u128(3));
        let ea = [0.9, 0.1, 0.0];
        let eb = [1.0, 0.02, 0.0];
        let ec = [0.0, 1.0, 0.0];
        let candidatos = [(a, &ea[..]), (b, &eb[..]), (c, &ec[..])];

        let (id, s) = mejor_coincidencia(&consulta, candidatos, UMBRAL_REID).unwrap();
        assert_eq!(id, b);
        assert!(s > 0.99);

        assert!(mejor_coincidencia(&consulta, [(c, &ec[..])], UMBRAL_REID).is_none());
    }

    #[test]
    fn dimension() {
        assert!(validar_dimension(&[0.0; 512]).is_ok());
        assert_eq!(
            validar_dimension(&[0.0; 3]),
            Err(Error::DimensionEmbedding(3))
        );
    }
}
