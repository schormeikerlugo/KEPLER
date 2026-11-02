//! Mapa offline de la Unidad de Campo: el PMTiles de la región se descarga una
//! vez (reanudable) y el estilo es el mismo del Centro de Control
//! (`kepler-mapa`). Los elementos (POIs, alertas, hallazgos, rutas) se guardan
//! en el almacén para verlos sin conexión; el rastro de la misión en curso sale
//! del almacén local.

use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::almacen::Almacen;

const CLAVE_ELEMENTOS: &str = "mapa_elementos";

#[derive(Debug, Clone, uniffi::Record)]
pub struct RegionMapa {
    pub id: String,
    pub tamano_mb: f64,
    /// Ya descargada y completa en el iPhone.
    pub descargada: bool,
}

/// Avance de la descarga del mapa (lo implementa Swift).
#[uniffi::export(with_foreign)]
pub trait ProgresoDescarga: Send + Sync {
    fn avance(&self, hecho: u64, total: u64);
}

pub fn carpeta(directorio: &Path) -> PathBuf {
    directorio.join("mapas")
}

pub fn archivo(directorio: &Path, id: &str) -> PathBuf {
    carpeta(directorio).join(format!("{id}.pmtiles"))
}

/// El PMTiles local más grande (si hay varios, el de la región completa).
pub fn local(directorio: &Path) -> Option<PathBuf> {
    std::fs::read_dir(carpeta(directorio))
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "pmtiles"))
        .max_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
}

/// Escribe el estilo (con rutas locales) junto a los glifos y devuelve su ruta.
pub fn escribir_estilo(directorio: &Path, pmtiles: &Path) -> Result<PathBuf, String> {
    let estilo = kepler_mapa::preparar_estilo(pmtiles, directorio)?;
    let ruta = directorio.join("mapa-estilo.json");
    std::fs::write(&ruta, estilo).map_err(|e| format!("{}: {e}", ruta.display()))?;
    Ok(ruta)
}

pub fn guardar_elementos(a: &Almacen, geojson: &Value) {
    let _ = a.escribir(CLAVE_ELEMENTOS, Some(geojson));
}

pub fn elementos_guardados(a: &Almacen) -> Value {
    a.leer(CLAVE_ELEMENTOS)
        .unwrap_or_else(|| json!({ "type": "FeatureCollection", "features": [] }))
}

/// Solo los elementos cuyo `tipo` está en `tipos` (`poi`, `persona`, `objeto`, `alerta`, `ruta`).
#[uniffi::export]
pub fn filtrar_elementos(geojson: String, tipos: Vec<String>) -> String {
    let mut v: Value = serde_json::from_str(&geojson)
        .unwrap_or_else(|_| json!({ "type": "FeatureCollection", "features": [] }));
    if let Some(f) = v["features"].as_array_mut() {
        f.retain(|x| {
            x["properties"]["tipo"]
                .as_str()
                .is_some_and(|t| tipos.iter().any(|q| q == t))
        });
    }
    v.to_string()
}

/// Rastro de la misión como GeoJSON (`[lng, lat]`).
pub fn rastro(a: &Almacen, mision: &str) -> Value {
    let coords: Vec<[f64; 2]> = a
        .puntos(mision)
        .unwrap_or_default()
        .into_iter()
        .map(|p| [p.lng, p.lat])
        .collect();
    let features = if coords.len() >= 2 {
        vec![
            json!({ "type": "Feature", "properties": {}, "geometry": { "type": "LineString", "coordinates": coords } }),
        ]
    } else {
        Vec::new()
    };
    json!({ "type": "FeatureCollection", "features": features })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::almacen::Punto;

    #[test]
    fn filtra_por_tipo() {
        let g = json!({ "type": "FeatureCollection", "features": [
            { "type": "Feature", "properties": { "tipo": "poi" } },
            { "type": "Feature", "properties": { "tipo": "alerta" } } ] });
        let f: Value =
            serde_json::from_str(&filtrar_elementos(g.to_string(), vec!["alerta".into()])).unwrap();
        assert_eq!(f["features"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn estilo_local_y_rastro() {
        let dir = std::env::temp_dir().join(format!("kepler-mapa-movil-{}", std::process::id()));
        std::fs::create_dir_all(carpeta(&dir)).unwrap();
        std::fs::write(archivo(&dir, "chica"), b"x").unwrap();
        std::fs::write(archivo(&dir, "venezuela"), b"xxxx").unwrap();
        let p = local(&dir).unwrap();
        assert!(p.ends_with("venezuela.pmtiles"));
        let e: Value = serde_json::from_str(
            &std::fs::read_to_string(escribir_estilo(&dir, &p).unwrap()).unwrap(),
        )
        .unwrap();
        assert!(
            e["sources"]["protomaps"]["url"]
                .as_str()
                .unwrap()
                .starts_with("pmtiles://file://")
        );
        let _ = std::fs::remove_dir_all(dir);

        let a = Almacen::en_memoria();
        assert_eq!(rastro(&a, "m")["features"].as_array().unwrap().len(), 0);
        for (i, t) in ["2026-11-01T10:00:00Z", "2026-11-01T10:00:05Z"]
            .iter()
            .enumerate()
        {
            let punto = Punto {
                id: i.to_string(),
                lat: 10.5 + i as f64 * 0.001,
                lng: -66.9,
                altitud: None,
                velocidad: None,
                rumbo: None,
                precision_m: None,
                registrado_en: (*t).into(),
            };
            a.guardar_punto("m", &punto).unwrap();
        }
        let r = rastro(&a, "m");
        assert_eq!(
            r["features"][0]["geometry"]["coordinates"][1],
            json!([-66.9, 10.501])
        );
    }
}
