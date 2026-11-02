//! Parecido entre textos para las búsquedas de Cortex: distancia de
//! Levenshtein sobre textos normalizados (minúsculas, sin tildes ni signos),
//! para encontrar «autobus», «botela» o «guardaparque» aunque lo guardado sea
//! «Autobús», «Botella» o «Guardaparques».

/// Similitud mínima para dar una coincidencia aproximada por buena.
pub const SIMILITUD_MIN: f64 = 0.7;

/// Minúsculas, sin tildes ni diéresis, solo letras/números y espacios simples.
pub fn normalizar(s: &str) -> String {
    let mut r = String::with_capacity(s.len());
    let mut espacio = false;
    for c in s.chars().flat_map(char::to_lowercase) {
        let c = match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ç' => 'c',
            otro => otro,
        };
        if c.is_alphanumeric() {
            r.push(c);
            espacio = false;
        } else if !espacio && !r.is_empty() {
            r.push(' ');
            espacio = true;
        }
    }
    r.trim_end().to_owned()
}

/// Ediciones (insertar, borrar, sustituir) para pasar de `a` a `b`, por caracteres.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    // Una sola fila de la matriz de programación dinámica
    let mut fila: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut diagonal = fila[0];
        fila[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let arriba = fila[j + 1];
            fila[j + 1] = (arriba + 1)
                .min(fila[j] + 1)
                .min(diagonal + usize::from(ca != cb));
            diagonal = arriba;
        }
    }
    fila[b.len()]
}

/// 1.0 = iguales (tras normalizar); 0.0 = nada en común.
pub fn similitud(a: &str, b: &str) -> f64 {
    let (a, b) = (normalizar(a), normalizar(b));
    let largo = a.chars().count().max(b.chars().count());
    if largo == 0 {
        return 1.0;
    }
    1.0 - levenshtein(&a, &b) as f64 / largo as f64
}

/// Cuánto se parece lo `buscado` a un `texto` guardado: el texto completo, si
/// lo contiene, o la mejor palabra (o grupo de palabras del mismo largo).
pub fn parecido(buscado: &str, texto: &str) -> f64 {
    let (q, t) = (normalizar(buscado), normalizar(texto));
    if q.is_empty() || t.is_empty() {
        return 0.0;
    }
    if t.contains(&q) {
        return 1.0;
    }
    let palabras: Vec<&str> = t.split(' ').collect();
    let n = q.split(' ').count().min(palabras.len());
    let mejor_ventana = palabras
        .windows(n)
        .map(|v| similitud(&q, &v.join(" ")))
        .fold(0.0, f64::max);
    similitud(&q, &t).max(mejor_ventana)
}

/// Los `textos` más parecidos a `buscado` (índice y similitud), de mayor a
/// menor, a partir de [`SIMILITUD_MIN`].
pub fn mas_parecidos<'a>(
    buscado: &str,
    textos: impl IntoIterator<Item = &'a str>,
    limite: usize,
) -> Vec<(usize, f64)> {
    let mut v: Vec<(usize, f64)> = textos
        .into_iter()
        .enumerate()
        .map(|(i, t)| (i, parecido(buscado, t)))
        .filter(|(_, s)| *s >= SIMILITUD_MIN)
        .collect();
    v.sort_by(|a, b| b.1.total_cmp(&a.1));
    v.truncate(limite);
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distancias_clasicas() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("", "abc"), 3);
        assert_eq!(levenshtein("botella", "botela"), 1);
        assert_eq!(levenshtein("ñandú", "nandu"), 2);
    }

    #[test]
    fn normaliza_tildes_y_signos() {
        assert_eq!(normalizar("  ¡Autobús  Rojo! "), "autobus rojo");
        assert!((similitud("autobus", "Autobús") - 1.0).abs() < 1e-9);
    }

    #[test]
    fn parecidos_por_palabra() {
        assert!(parecido("botela", "Botella") > 0.85);
        assert!(parecido("guardaparque", "Guardaparques") > 0.9);
        assert!((parecido("derrumbe", "Derrumbe en la quebrada") - 1.0).abs() < 1e-9);
        assert!(parecido("quebrda", "Derrumbe en la quebrada") > 0.85);
        assert!(parecido("perro", "Autobús") < SIMILITUD_MIN);
        let r = mas_parecidos("autbus", ["Perro", "Autobús", "Banco"], 5);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].0, 1);
    }
}
