//! Genera `ui/tema.slint` desde `design/tokens.json` y compila la UI.
//!
//! El tema se escribe en `ui/` (y se versiona) para que la vista previa en vivo
//! de Slint lo encuentre; solo se reescribe si cambia.

use std::fmt::Write;
use std::path::Path;

use serde_json::Value;

fn main() {
    let tokens = Path::new("../../design/tokens.json");
    println!("cargo:rerun-if-changed={}", tokens.display());
    let json: Value = serde_json::from_str(&std::fs::read_to_string(tokens).expect("leer tokens"))
        .expect("tokens.json válido");

    let tema = generar(&json);
    let destino = Path::new("ui/tema.slint");
    if std::fs::read_to_string(destino).ok().as_deref() != Some(tema.as_str()) {
        std::fs::write(destino, tema).expect("escribir ui/tema.slint");
    }

    // Estilo oscuro para los pocos widgets estándar (ComboBox, AboutSlint)
    let config = slint_build::CompilerConfiguration::new().with_style("fluent-dark".into());
    slint_build::compile_with_config("ui/app.slint", config).expect("compilar la UI");
}

fn generar(t: &Value) -> String {
    let mut s = String::from(
        "// GENERADO por build.rs desde design/tokens.json: no editar a mano.\n\nexport global Tema {\n",
    );
    let mut prop = |tipo: &str, nombre: &str, valor: String| {
        let nombre = nombre.replace('_', "-");
        writeln!(s, "    out property <{tipo}> {nombre}: {valor};").unwrap();
    };

    for (ruta, v) in hojas(&t["color"], "") {
        prop("color", &ruta, v.as_str().expect("color en hex").to_owned());
    }
    for (k, v) in obj(&t["fuente"]["tamano"]) {
        prop("length", &format!("t-{k}"), px(v));
    }
    for (k, v) in obj(&t["fuente"]["peso"]) {
        prop("int", &format!("peso-{k}"), v.to_string());
    }
    for (k, v) in obj(&t["fuente"]["espaciado_letras"]) {
        prop("length", &format!("espaciado-{k}"), px(v));
    }
    for grupo in ["radio", "espacio"] {
        for (k, v) in obj(&t[grupo]) {
            prop("length", &format!("{grupo}-{k}"), px(v));
        }
    }
    for (k, v) in obj(&t["relleno"]) {
        prop("length", &format!("relleno-{k}-v"), px(&v[0]));
        prop("length", &format!("relleno-{k}-h"), px(&v[1]));
    }
    for (k, v) in obj(&t["sombra"]) {
        let alfa = (v["opacidad"].as_f64().unwrap() * 255.0).round() as u8;
        let color = format!("{}{alfa:02x}", v["color"].as_str().unwrap());
        prop("color", k, color);
        prop("length", &format!("{k}-radio"), px(&v["radio"]));
    }
    for (k, v) in obj(&t["movimiento"]) {
        let k = k.trim_end_matches("_ms");
        prop("duration", &format!("mov-{k}"), format!("{}ms", v));
    }
    s.push_str("}\n");
    s
}

fn obj(v: &Value) -> impl Iterator<Item = (&String, &Value)> {
    v.as_object().expect("objeto en tokens.json").iter()
}

fn px(v: &Value) -> String {
    format!("{}px", v.as_f64().expect("número"))
}

/// Aplana objetos anidados: `aire.buena` → `aire-buena`.
fn hojas<'a>(v: &'a Value, prefijo: &str) -> Vec<(String, &'a Value)> {
    let mut r = Vec::new();
    for (k, hijo) in obj(v) {
        let nombre = if prefijo.is_empty() {
            k.clone()
        } else {
            format!("{prefijo}-{k}")
        };
        if hijo.is_object() {
            r.extend(hojas(hijo, &nombre));
        } else {
            r.push((nombre, hijo));
        }
    }
    r
}
