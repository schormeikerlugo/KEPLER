//! Serde para columnas `vector(512)` de pgvector.
//!
//! PostgREST devuelve y acepta los vectores como texto `"[0.1,0.2,...]"`; al
//! leer también se acepta un array JSON normal.

use serde::{Deserialize, Deserializer, Serializer, de};

pub fn serialize<S: Serializer>(v: &Option<Vec<f32>>, s: S) -> Result<S::Ok, S::Error> {
    match v {
        None => s.serialize_none(),
        Some(v) => {
            let cuerpo = v.iter().map(f32::to_string).collect::<Vec<_>>().join(",");
            s.serialize_str(&format!("[{cuerpo}]"))
        }
    }
}

pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Vec<f32>>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Forma {
        Texto(String),
        Lista(Vec<f32>),
    }

    match Option::<Forma>::deserialize(d)? {
        None => Ok(None),
        Some(Forma::Lista(v)) => Ok(Some(v)),
        Some(Forma::Texto(t)) => {
            let interior = t
                .trim()
                .strip_prefix('[')
                .and_then(|r| r.strip_suffix(']'))
                .ok_or_else(|| de::Error::custom("vector sin corchetes"))?;
            if interior.trim().is_empty() {
                return Ok(Some(Vec::new()));
            }
            interior
                .split(',')
                .map(|n| n.trim().parse::<f32>().map_err(de::Error::custom))
                .collect::<Result<Vec<_>, _>>()
                .map(Some)
        }
    }
}

#[cfg(test)]
mod tests {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Fila {
        #[serde(default, with = "super")]
        embedding: Option<Vec<f32>>,
    }

    #[test]
    fn lee_texto_de_postgrest_y_array() {
        let a: Fila = serde_json::from_str(r#"{"embedding":"[0.5,-1,0.25]"}"#).unwrap();
        let b: Fila = serde_json::from_str(r#"{"embedding":[0.5,-1,0.25]}"#).unwrap();
        assert_eq!(a.embedding, Some(vec![0.5, -1.0, 0.25]));
        assert_eq!(a, b);
        let c: Fila = serde_json::from_str(r#"{"embedding":null}"#).unwrap();
        assert_eq!(c.embedding, None);
        let d: Fila = serde_json::from_str("{}").unwrap();
        assert_eq!(d.embedding, None);
    }

    #[test]
    fn escribe_texto_para_postgrest() {
        let f = Fila {
            embedding: Some(vec![0.5, -1.0]),
        };
        assert_eq!(
            serde_json::to_string(&f).unwrap(),
            r#"{"embedding":"[0.5,-1]"}"#
        );
    }

    #[test]
    fn rechaza_texto_mal_formado() {
        assert!(serde_json::from_str::<Fila>(r#"{"embedding":"0.5,1"}"#).is_err());
        assert!(serde_json::from_str::<Fila>(r#"{"embedding":"[0,5;1]"}"#).is_err());
    }
}
