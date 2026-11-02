//! Estilo del mapa de KEPLER, compartido por el Centro de Control y el iPhone:
//! Odradek (`design/mapa/odradek.json`) sobre PMTiles locales (offline), glifos
//! Noto Sans incluidos en el binario y las capas propias en GeoJSON (fuentes
//! `kepler`, `rastro`, `unidades`, `plan`). Colores de `design/tokens.json`.

use std::path::Path;

use serde_json::{Value, json};

const ESTILO: &str = include_str!("../../../design/mapa/odradek.json");
const GLIFOS: &[(&str, &[u8])] = &[
    (
        "0-255",
        include_bytes!("../../../design/mapa/glyphs/Noto Sans Regular/0-255.pbf"),
    ),
    (
        "256-511",
        include_bytes!("../../../design/mapa/glyphs/Noto Sans Regular/256-511.pbf"),
    ),
    (
        "512-767",
        include_bytes!("../../../design/mapa/glyphs/Noto Sans Regular/512-767.pbf"),
    ),
    (
        "8192-8447",
        include_bytes!("../../../design/mapa/glyphs/Noto Sans Regular/8192-8447.pbf"),
    ),
    (
        "8448-8703",
        include_bytes!("../../../design/mapa/glyphs/Noto Sans Regular/8448-8703.pbf"),
    ),
    (
        "9472-9727",
        include_bytes!("../../../design/mapa/glyphs/Noto Sans Regular/9472-9727.pbf"),
    ),
];

/// Odradek con rutas locales (PMTiles y glifos) y las capas de KEPLER encima.
pub fn preparar_estilo(pmtiles: &Path, datos: &Path) -> Result<String, String> {
    let glifos = datos.join("glifos").join("Noto Sans Regular");
    std::fs::create_dir_all(&glifos).map_err(|e| format!("{}: {e}", glifos.display()))?;
    for (rango, bytes) in GLIFOS {
        let ruta = glifos.join(format!("{rango}.pbf"));
        if std::fs::metadata(&ruta).map(|m| m.len()).ok() != Some(bytes.len() as u64) {
            std::fs::write(&ruta, bytes).map_err(|e| format!("{}: {e}", ruta.display()))?;
        }
    }
    let mut estilo: Value = serde_json::from_str(ESTILO).map_err(|e| e.to_string())?;
    estilo["sources"]["protomaps"]["url"] = json!(format!("pmtiles://{}", url_archivo(pmtiles)));
    estilo["glyphs"] = json!(format!(
        "{}/{{fontstack}}/{{range}}.pbf",
        url_archivo(&datos.join("glifos"))
    ));
    let vacio =
        json!({ "type": "geojson", "data": { "type": "FeatureCollection", "features": [] } });
    estilo["sources"]["kepler"] = vacio.clone();
    estilo["sources"]["rastro"] = vacio.clone();
    estilo["sources"]["unidades"] = vacio.clone();
    estilo["sources"]["plan"] = vacio;
    let capas = estilo["layers"].as_array_mut().ok_or("estilo sin capas")?;
    capas.extend(capas_kepler());
    serde_json::to_string(&estilo).map_err(|e| e.to_string())
}

pub fn url_archivo(ruta: &Path) -> String {
    let texto = ruta
        .to_string_lossy()
        .replace('%', "%25")
        .replace(' ', "%20");
    format!("file://{texto}")
}

/// Colores de `design/tokens.json`.
fn capas_kepler() -> Vec<Value> {
    let color = json!([
        "match",
        ["get", "tipo"],
        "alerta",
        "#FF4444",
        "objeto",
        "#00D4AA",
        "persona",
        [
            "match",
            ["get", "nivel"],
            "hostil",
            "#FF4444",
            "aliado",
            "#00D4AA",
            "neutral",
            "#3FA8FF",
            "#999999"
        ],
        "poi",
        [
            "match",
            ["get", "nivel"],
            "critico",
            "#FF4444",
            "alto",
            "#FF8844",
            "medio",
            "#FFBB33",
            "#9BD66B"
        ],
        "#FFFFFF"
    ]);
    let punto = json!(["==", ["geometry-type"], "Point"]);
    let linea = json!(["==", ["geometry-type"], "LineString"]);
    vec![
        json!({ "id": "kepler-rutas", "type": "line", "source": "kepler", "filter": linea,
                "layout": { "line-cap": "round", "line-join": "round" },
                "paint": { "line-width": 3, "line-opacity": 0.85,
                           "line-color": ["match", ["get", "nivel"], "seguro", "#00D4AA", "precaucion", "#FFBB33",
                                          "peligro", "#FF4444", "#999999"] } }),
        json!({ "id": "rastro-halo", "type": "line", "source": "rastro",
                "layout": { "line-cap": "round", "line-join": "round" },
                "paint": { "line-color": "#3FA8FF", "line-width": 9, "line-opacity": 0.25, "line-blur": 4 } }),
        json!({ "id": "rastro", "type": "line", "source": "rastro",
                "layout": { "line-cap": "round", "line-join": "round" },
                "paint": { "line-color": "#3FA8FF", "line-width": 2.5 } }),
        json!({ "id": "kepler-halo", "type": "circle", "source": "kepler", "filter": punto,
                "paint": { "circle-color": color, "circle-radius": 13, "circle-opacity": 0.22, "circle-blur": 0.7 } }),
        json!({ "id": "kepler-puntos", "type": "circle", "source": "kepler", "filter": punto,
                "paint": { "circle-color": color, "circle-radius": 5.5,
                           "circle-stroke-color": "#0a0f14", "circle-stroke-width": 1.5 } }),
        json!({ "id": "unidades-recorrido", "type": "line", "source": "unidades",
                "filter": ["==", ["geometry-type"], "LineString"],
                "layout": { "line-cap": "round", "line-join": "round" },
                "paint": { "line-color": "#00D4AA", "line-width": 2.5, "line-dasharray": [1, 1.5] } }),
        json!({ "id": "unidades-halo", "type": "circle", "source": "unidades",
                "filter": ["==", ["geometry-type"], "Point"],
                "paint": { "circle-color": "#00D4AA", "circle-radius": 18, "circle-opacity": 0.25, "circle-blur": 0.6 } }),
        json!({ "id": "unidades-punto", "type": "circle", "source": "unidades",
                "filter": ["==", ["geometry-type"], "Point"],
                "paint": { "circle-color": "#00D4AA", "circle-radius": 7,
                           "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 } }),
        json!({ "id": "plan-linea", "type": "line", "source": "plan",
                "filter": ["==", ["geometry-type"], "LineString"],
                "layout": { "line-cap": "round", "line-join": "round" },
                "paint": { "line-color": "#FFFFFF", "line-width": 2.5, "line-dasharray": [2, 1.5] } }),
        json!({ "id": "plan-vertices", "type": "circle", "source": "plan",
                "filter": ["==", ["geometry-type"], "Point"],
                "paint": { "circle-color": "#3FA8FF", "circle-radius": 5,
                           "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 1.5 } }),
        json!({ "id": "kepler-nombres", "type": "symbol", "source": "kepler", "minzoom": 14, "filter": punto,
                "layout": { "text-field": ["get", "nombre"], "text-font": ["Noto Sans Regular"],
                            "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top" },
                "paint": { "text-color": "#CCCCCC", "text-halo-color": "#0a0f14", "text-halo-width": 1.5 } }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estilo_con_rutas_locales_y_capas_propias() {
        let dir = std::env::temp_dir().join("kepler-prueba-estilo");
        let e: Value =
            serde_json::from_str(&preparar_estilo(Path::new("/a b/vzla.pmtiles"), &dir).unwrap())
                .unwrap();
        assert_eq!(
            e["sources"]["protomaps"]["url"],
            "pmtiles://file:///a%20b/vzla.pmtiles"
        );
        assert!(
            e["layers"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["id"] == "kepler-puntos")
        );
        assert!(dir.join("glifos/Noto Sans Regular/0-255.pbf").exists());
    }
}
