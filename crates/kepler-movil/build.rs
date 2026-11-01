//! Genera `apps/ios/Kepler/Tema/Tema.swift` desde `design/tokens.json`, la
//! misma fuente que el tema de Slint del escritorio. Solo reescribe si cambia.

use std::fmt::Write;
use std::path::Path;

use serde_json::Value;

fn main() {
    let tokens = Path::new("../../design/tokens.json");
    println!("cargo:rerun-if-changed={}", tokens.display());
    let json: Value = serde_json::from_str(&std::fs::read_to_string(tokens).expect("leer tokens"))
        .expect("tokens.json válido");
    let swift = generar(&json);
    let destino = Path::new("../../apps/ios/Kepler/Tema/Tema.swift");
    if std::fs::read_to_string(destino).ok().as_deref() != Some(swift.as_str()) {
        std::fs::create_dir_all(destino.parent().unwrap()).expect("crear Tema/");
        std::fs::write(destino, swift).expect("escribir Tema.swift");
    }
}

fn generar(t: &Value) -> String {
    let mut s = String::from(
        "// GENERADO por crates/kepler-movil/build.rs desde design/tokens.json: no editar a mano.\n\
         import SwiftUI\n\n\
         enum Tema {\n",
    );
    s.push_str("    enum Color {\n");
    for (nombre, v) in hojas(&t["color"], "") {
        let hex = v.as_str().expect("color en hex");
        let _ = writeln!(
            s,
            "        static let {} = SwiftUI.Color(hex: \"{hex}\")",
            camello(&nombre)
        );
    }
    s.push_str("    }\n\n    enum Tamano {\n");
    for (k, v) in obj(&t["fuente"]["tamano"]) {
        let _ = writeln!(s, "        static let {}: CGFloat = {}", camello(k), num(v));
    }
    s.push_str("    }\n\n    enum Espaciado {\n");
    for (k, v) in obj(&t["fuente"]["espaciado_letras"]) {
        let _ = writeln!(s, "        static let {}: CGFloat = {}", camello(k), num(v));
    }
    for (grupo, nombre) in [("radio", "Radio"), ("espacio", "Espacio")] {
        let _ = writeln!(s, "    }}\n\n    enum {nombre} {{");
        for (k, v) in obj(&t[grupo]) {
            let _ = writeln!(s, "        static let {}: CGFloat = {}", camello(k), num(v));
        }
    }
    s.push_str("    }\n\n    enum Movimiento {\n");
    for (k, v) in obj(&t["movimiento"]) {
        let ms = v.as_f64().unwrap_or(0.0);
        let _ = writeln!(
            s,
            "        static let {}: Double = {}",
            camello(k.trim_end_matches("_ms")),
            ms / 1000.0
        );
    }
    s.push_str("    }\n}\n");
    s
}

fn obj(v: &Value) -> impl Iterator<Item = (&String, &Value)> {
    v.as_object().expect("objeto en tokens.json").iter()
}

fn num(v: &Value) -> String {
    let n = v.as_f64().expect("número");
    if n.fract() == 0.0 {
        format!("{n:.0}")
    } else {
        n.to_string()
    }
}

/// `texto_secundario` → `textoSecundario`; `aire-buena` → `aireBuena`.
fn camello(s: &str) -> String {
    let mut r = String::new();
    let mut mayus = false;
    for c in s.chars() {
        if c == '_' || c == '-' {
            mayus = true;
        } else if mayus {
            r.extend(c.to_uppercase());
            mayus = false;
        } else {
            r.push(c);
        }
    }
    r
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
