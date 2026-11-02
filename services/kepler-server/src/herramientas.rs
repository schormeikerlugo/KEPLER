//! Herramientas de Cortex: consultas de solo lectura que el modelo puede pedir.
//! Corren como el usuario (RLS): Cortex solo ve lo que el explorador puede ver.

use kepler_core::texto;
use serde_json::{Value, json};

use crate::auth::Sesion;
use crate::estado::Estado;

pub fn definiciones() -> Vec<Value> {
    use kepler_ai::herramienta;
    vec![
        herramienta(
            "resumen_explorador",
            "Resumen del explorador: cuántas misiones, objetos, personas, POIs y rutas tiene, y qué requiere atención.",
            json!({ "type": "object", "properties": {} }),
        ),
        herramienta(
            "listar_misiones",
            "Misiones del explorador, las más recientes primero, con zona, fechas, distancia y duración.",
            json!({ "type": "object", "properties": {
                "estado": { "type": "string", "enum": ["planificada", "activa", "completada", "abortada"] },
                "limite": { "type": "integer", "description": "Máximo de misiones (1-50, por defecto 10)" }
            } }),
        ),
        herramienta(
            "detalle_mision",
            "Detalle de una misión por su código (MISION-...) o título: datos, clima al despegar y hallazgos registrados en ella.",
            json!({ "type": "object", "required": ["mision"], "properties": {
                "mision": { "type": "string", "description": "Código o parte del título" }
            } }),
        ),
        herramienta(
            "buscar_hallazgos",
            "Busca objetos, personas o puntos de interés propios por nombre, descripción, clase o etiqueta (sin texto: los más recientes). \
             Tolera faltas de ortografía: si no hay coincidencia exacta devuelve las más parecidas (`aproximada`).",
            json!({ "type": "object", "properties": {
                "texto": { "type": "string" },
                "tipo": { "type": "string", "enum": ["objetos", "personas", "puntos_interes"] },
                "etiqueta": { "type": "string", "description": "Solo objetos con esta etiqueta personal" },
                "limite": { "type": "integer", "description": "Máximo de resultados (1-30, por defecto 10)" }
            } }),
        ),
        herramienta(
            "mostrar_imagenes",
            "Muestra al explorador las FOTOS de sus hallazgos (objetos, personas, POIs). Úsala siempre que pida ver, \
             enseñar o mostrar una foto o imagen. Busca igual que buscar_hallazgos (también por etiqueta) y las fotos \
             aparecen en el chat; tú solo describe brevemente qué se muestra.",
            json!({ "type": "object", "properties": {
                "texto": { "type": "string", "description": "Qué buscar: nombre, clase, descripción o etiqueta" },
                "tipo": { "type": "string", "enum": ["objetos", "personas", "puntos_interes"] },
                "etiqueta": { "type": "string" },
                "limite": { "type": "integer", "description": "Máximo de fotos (1-12, por defecto 6)" }
            } }),
        ),
        herramienta(
            "peligros_cercanos",
            "Peligros alrededor de un punto: POIs de riesgo alto o crítico (propios y compartidos) y alertas de personas hostiles.",
            json!({ "type": "object", "required": ["lat", "lng"], "properties": {
                "lat": { "type": "number" }, "lng": { "type": "number" },
                "radio_km": { "type": "number", "description": "Radio en km (por defecto 5, máximo 50)" }
            } }),
        ),
        herramienta(
            "clima",
            "Clima actual en unas coordenadas: temperatura, lluvia, viento, UV y la categoría de KEPLER.",
            json!({ "type": "object", "required": ["lat", "lng"], "properties": {
                "lat": { "type": "number" }, "lng": { "type": "number" }
            } }),
        ),
    ]
}

/// Ejecuta una herramienta; los errores vuelven al modelo como `{"error": ...}`.
pub async fn ejecutar(estado: &Estado, sesion: &Sesion, nombre: &str, args: &Value) -> Value {
    match ejecutar_o_fallar(estado, sesion, nombre, args).await {
        Ok(v) => v,
        Err(e) => json!({ "error": e }),
    }
}

async fn ejecutar_o_fallar(
    estado: &Estado,
    sesion: &Sesion,
    nombre: &str,
    args: &Value,
) -> Result<Value, String> {
    let entero =
        |k: &str, defecto: i64, max: i64| args[k].as_i64().unwrap_or(defecto).clamp(1, max);
    let texto = |k: &str| {
        args[k]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };
    let numero = |k: &str| {
        args[k]
            .as_f64()
            .or_else(|| args[k].as_str().and_then(|s| s.parse().ok()))
            .ok_or_else(|| format!("falta `{k}`"))
    };

    if nombre == "clima" {
        let c = kepler_core::Coordenada::new(numero("lat")?, numero("lng")?)
            .map_err(|e| e.to_string())?;
        let clima = estado.externos.clima(c.lat, c.lng).await?;
        return serde_json::to_value(clima).map_err(|e| e.to_string());
    }

    let mut tx = estado
        .db
        .como_usuario(sesion)
        .await
        .map_err(|e| e.to_string())?;
    let consulta = |sql: &'static str| sqlx::query_scalar::<_, Value>(sql);
    let r = match nombre {
        "resumen_explorador" => consulta(
            "select jsonb_build_object(
                'misiones', (select count(*) from public.misiones where eliminado_en is null),
                'misiones_activas', (select count(*) from public.misiones where eliminado_en is null and estado = 'activa'),
                'km_totales', (select round((coalesce(sum(distancia_m), 0) / 1000)::numeric, 1) from public.misiones where eliminado_en is null and estado = 'completada'),
                'objetos', (select count(*) from public.objetos where user_id = (select auth.uid()) and eliminado_en is null),
                'personas', (select count(*) from public.personas where eliminado_en is null),
                'personas_hostiles', (select count(*) from public.personas where eliminado_en is null and hostilidad = 'hostil'),
                'pois', (select count(*) from public.puntos_interes where user_id = (select auth.uid()) and eliminado_en is null),
                'pois_riesgo_alto', (select count(*) from public.puntos_interes where user_id = (select auth.uid()) and eliminado_en is null and nivel_riesgo in ('alto', 'critico') and estado <> 'inactivo'),
                'reportes_de_otros', (select count(*) from public.puntos_interes where user_id <> (select auth.uid()) and eliminado_en is null and estado <> 'inactivo'),
                'rutas', (select count(*) from public.rutas where eliminado_en is null),
                'misiones_sin_documentar', (select count(*) from public.misiones where eliminado_en is null and estado = 'completada' and coalesce(descripcion_ia, '') = ''))",
        )
        .fetch_one(&mut *tx)
        .await,
        "listar_misiones" => consulta(
            "select coalesce(jsonb_agg(m), '[]') from (
                select codigo, titulo, estado, zona, tipo_terreno, inicio_en, fin_en,
                       round((distancia_m / 1000)::numeric, 2) as distancia_km,
                       round(duracion_s / 60.0) as duracion_min
                from public.misiones
                where eliminado_en is null and ($1::text is null or estado = $1)
                order by creado_en desc limit $2) m",
        )
        .bind(texto("estado"))
        .bind(entero("limite", 10, 50))
        .fetch_one(&mut *tx)
        .await,
        "detalle_mision" => {
            let busqueda = texto("mision").ok_or("falta `mision`")?;
            detalle_mision(&mut tx, &busqueda).await
        }
        "buscar_hallazgos" | "mostrar_imagenes" => {
            let fotos = nombre == "mostrar_imagenes";
            let limite = if fotos { entero("limite", 6, 12) } else { entero("limite", 10, 30) } as usize;
            buscar(&mut tx, texto("texto"), texto("tipo"), texto("etiqueta"), limite, fotos).await
        }
        "peligros_cercanos" => {
            let c = kepler_core::Coordenada::new(numero("lat")?, numero("lng")?).map_err(|e| e.to_string())?;
            let radio_m = (args["radio_km"].as_f64().unwrap_or(5.0).clamp(0.1, 50.0)) * 1000.0;
            consulta(
                "with punto as (select extensions.st_setsrid(extensions.st_makepoint($2, $1), 4326)::extensions.geography as g)
                 select coalesce(jsonb_agg(p order by p.distancia_m), '[]') from (
                    select 'poi' as tipo, x.nombre, x.nivel_riesgo as nivel, e.nombre_usuario as autor,
                           x.user_id = (select auth.uid()) as propio,
                           round(extensions.st_distance(x.posicion, punto.g)::numeric) as distancia_m
                    from public.puntos_interes x
                    cross join punto
                    left join public.exploradores e on e.id = x.user_id
                    where x.eliminado_en is null and x.estado <> 'inactivo'
                      and x.nivel_riesgo in ('alto', 'critico') and extensions.st_dwithin(x.posicion, punto.g, $3)
                    union all
                    select 'persona_hostil', 'Persona hostil', 'hostil', x.autor, x.user_id = (select auth.uid()),
                           round(extensions.st_distance(x.posicion, punto.g)::numeric)
                    from public.alertas_personas x, punto
                    where extensions.st_dwithin(x.posicion, punto.g, $3)
                 ) p",
            )
            .bind(c.lat)
            .bind(c.lng)
            .bind(radio_m)
            .fetch_one(&mut *tx)
            .await
        }
        otra => return Err(format!("herramienta desconocida: {otra}")),
    };
    let v = r.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(v)
}

/// Parecidos por debajo del umbral que aún vale la pena sugerir («¿quizás…?»).
const SUGERENCIA_MIN: f64 = 0.5;
/// Hallazgos que se revisan para la búsqueda aproximada (los más recientes).
const CANDIDATOS_MAX: i64 = 3000;

/// Misión por código o título; con faltas de ortografía, la más parecida.
async fn detalle_mision(tx: &mut crate::db::Tx<'_>, busqueda: &str) -> Result<Value, sqlx::Error> {
    let misiones: Vec<(uuid::Uuid, String, Option<String>)> = sqlx::query_as(
        "select id, codigo, titulo from public.misiones where eliminado_en is null order by creado_en desc limit 500",
    )
    .fetch_all(&mut **tx)
    .await?;
    let q = texto::normalizar(busqueda);
    let textos: Vec<String> = misiones
        .iter()
        .map(|(_, c, t)| format!("{} {c}", t.as_deref().unwrap_or_default()))
        .collect();
    let exacta = textos
        .iter()
        .position(|t| texto::normalizar(t).contains(&q));
    let (indice, aproximada) = match exacta {
        Some(i) => (Some(i), None),
        None => {
            match texto::mas_parecidos(busqueda, textos.iter().map(String::as_str), 1).first() {
                Some(&(i, s)) => (Some(i), Some(s)),
                None => (None, None),
            }
        }
    };
    let Some(i) = indice else {
        return Ok(json!({
            "error": format!("no hay ninguna misión parecida a «{busqueda}»"),
            "sugerencias": sugerencias(busqueda, misiones.iter().map(|(_, c, t)| t.clone().unwrap_or_else(|| c.clone()))),
        }));
    };
    let mut v: Value = sqlx::query_scalar(
        "select jsonb_build_object(
            'codigo', m.codigo, 'titulo', m.titulo, 'objetivo', m.objetivo, 'estado', m.estado,
            'zona', m.zona, 'terreno', m.tipo_terreno, 'dificultad', m.dificultad,
            'inicio', m.inicio_en, 'fin', m.fin_en,
            'distancia_km', round((m.distancia_m / 1000)::numeric, 2),
            'duracion_min', round(m.duracion_s / 60.0),
            'clima_al_despegar', m.clima - 'consultado_en',
            'puntos_gps', (select count(*) from public.rastro_gps r where r.mision_id = m.id),
            'objetos', (select coalesce(jsonb_agg(o.nombre), '[]') from public.objetos o where o.mision_id = m.id and o.eliminado_en is null),
            'personas', (select coalesce(jsonb_agg(p.nombre || ' (' || p.hostilidad || ')'), '[]') from public.personas p where p.mision_id = m.id and p.eliminado_en is null),
            'pois', (select coalesce(jsonb_agg(x.nombre || ' (riesgo ' || x.nivel_riesgo || ')'), '[]') from public.puntos_interes x where x.mision_id = m.id and x.eliminado_en is null))
         from public.misiones m where m.id = $1",
    )
    .bind(misiones[i].0)
    .fetch_one(&mut **tx)
    .await?;
    if let Some(s) = aproximada {
        v["coincidencia_aproximada"] = json!({ "buscado": busqueda, "similitud": redondear(s) });
    }
    Ok(v)
}

/// Hallazgos propios por texto (nombre, descripción, clase, etiquetas), tipo y
/// etiqueta. Sin coincidencia exacta (sin tildes ni mayúsculas), los más
/// parecidos por Levenshtein; si tampoco, sugerencias.
async fn buscar(
    tx: &mut crate::db::Tx<'_>,
    q: Option<String>,
    tipo: Option<String>,
    etiqueta: Option<String>,
    limite: usize,
    solo_con_foto: bool,
) -> Result<Value, sqlx::Error> {
    // «muéstrame las personas»: el texto es el tipo, no un nombre
    let (q, tipo) = match (q.as_deref().map(texto::normalizar).as_deref(), &tipo) {
        (Some("persona" | "personas" | "gente"), None) => (None, Some("personas".to_owned())),
        (Some("objeto" | "objetos" | "cosas"), None) => (None, Some("objetos".to_owned())),
        (Some("poi" | "pois" | "punto de interes" | "puntos de interes" | "lugares"), None) => {
            (None, Some("puntos_interes".to_owned()))
        }
        _ => (q, tipo),
    };
    let filas = candidatos(tx, tipo, solo_con_foto).await?;
    let etiquetas = |f: &Value| -> Vec<String> {
        f["etiquetas"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|e| e.as_str().map(str::to_owned))
            .collect()
    };
    // Filtro de etiqueta (también aproximado)
    let filas: Vec<Value> = match &etiqueta {
        Some(e) => filas
            .into_iter()
            .filter(|f| {
                etiquetas(f)
                    .iter()
                    .any(|t| texto::parecido(e, t) >= texto::SIMILITUD_MIN)
            })
            .collect(),
        None => filas,
    };
    // Todo lo buscable de cada hallazgo, también la clase en español
    let buscable = |f: &Value| {
        let clase = f["clase"]
            .as_str()
            .map(kepler_core::coco::nombre)
            .unwrap_or_default();
        format!(
            "{} {} {} {}",
            f["nombre"].as_str().unwrap_or_default(),
            clase,
            f["detalle"].as_str().unwrap_or_default(),
            etiquetas(f).join(" ")
        )
    };
    let mut resultado = json!({});
    let elegidas: Vec<Value> = match &q {
        None => filas.iter().take(limite).cloned().collect(),
        Some(q) => {
            let nq = texto::normalizar(q);
            let exactas: Vec<Value> = filas
                .iter()
                .filter(|f| texto::normalizar(&buscable(f)).contains(&nq))
                .take(limite)
                .cloned()
                .collect();
            if !exactas.is_empty() {
                exactas
            } else {
                let textos: Vec<String> = filas.iter().map(buscable).collect();
                let parecidas = texto::mas_parecidos(q, textos.iter().map(String::as_str), limite);
                if parecidas.is_empty() {
                    resultado["sugerencias"] = sugerencias(
                        q,
                        filas
                            .iter()
                            .map(|f| f["nombre"].as_str().unwrap_or_default().to_owned()),
                    );
                } else {
                    resultado["aproximada"] = json!(true);
                    resultado["nota"] = json!(format!(
                        "No hay nada exactamente «{q}»; estos son los hallazgos más parecidos (puede ser una falta de ortografía)"
                    ));
                }
                parecidas
                    .into_iter()
                    .map(|(i, s)| {
                        let mut f = filas[i].clone();
                        f["similitud"] = json!(redondear(s));
                        f
                    })
                    .collect()
            }
        }
    };
    resultado["total"] = json!(elegidas.len());
    resultado["resultados"] = Value::Array(elegidas);
    Ok(resultado)
}

/// Hallazgos propios (los más recientes) con lo necesario para buscarlos.
async fn candidatos(
    tx: &mut crate::db::Tx<'_>,
    tipo: Option<String>,
    solo_con_foto: bool,
) -> Result<Vec<Value>, sqlx::Error> {
    sqlx::query_scalar(
        "select to_jsonb(h) from (
            select 'objeto' as tipo, o.id, o.nombre, o.descripcion as detalle, o.clase_yolo as clase,
                   null::text as nivel, o.imagen_path, o.capturado_en, o.lat, o.lng,
                   (select coalesce(jsonb_agg(e.nombre), '[]') from public.objeto_etiquetas oe
                    join public.etiquetas e on e.id = oe.etiqueta_id where oe.objeto_id = o.id) as etiquetas
            from public.objetos o
            where o.user_id = (select auth.uid()) and o.eliminado_en is null and ($1::text is null or $1 = 'objetos')
            union all
            select 'persona', p.id, p.nombre, p.rasgos_fisicos, null, p.hostilidad, p.imagen_path, p.capturado_en,
                   p.lat, p.lng, '[]'::jsonb
            from public.personas p
            where p.eliminado_en is null and ($1::text is null or $1 = 'personas')
            union all
            select 'poi', x.id, x.nombre, x.descripcion, x.clase_yolo, x.nivel_riesgo, x.imagen_path, x.capturado_en,
                   x.lat, x.lng, '[]'::jsonb
            from public.puntos_interes x
            where x.user_id = (select auth.uid()) and x.eliminado_en is null and ($1::text is null or $1 = 'puntos_interes')
         ) h
         where (not $2 or h.imagen_path is not null)
         order by h.capturado_en desc limit $3",
    )
    .bind(tipo)
    .bind(solo_con_foto)
    .bind(CANDIDATOS_MAX)
    .fetch_all(&mut **tx)
    .await
}

/// Palabras que no sirven para buscar hallazgos en una pregunta.
const VACIAS: &[&str] = &[
    "algun",
    "alguna",
    "algunos",
    "algunas",
    "tengo",
    "tienes",
    "hora",
    "cuando",
    "donde",
    "como",
    "cual",
    "cuales",
    "muestrame",
    "muestra",
    "ensename",
    "fotos",
    "foto",
    "imagen",
    "imagenes",
    "capture",
    "capturado",
    "capturada",
    "registre",
    "registrado",
    "registrada",
    "visto",
    "vimos",
    "esta",
    "este",
    "esos",
    "esas",
    "para",
    "sobre",
    "dame",
    "quiero",
    "puedes",
    "busca",
    "buscar",
    "hallazgo",
    "hallazgos",
    "mision",
    "misiones",
    "todos",
    "todas",
    "cerca",
];

/// Hallazgos cuyo nombre se parece a alguna palabra de la pregunta: se dan al
/// modelo como contexto para que no conteste «no está» sin haber buscado.
pub async fn pistas(
    estado: &Estado,
    sesion: &Sesion,
    pregunta: &str,
    desfase_min: Option<i32>,
) -> Option<String> {
    let palabras: Vec<String> = texto::normalizar(pregunta)
        .split(' ')
        .filter(|p| p.chars().count() >= 4 && !VACIAS.contains(p))
        .map(str::to_owned)
        .collect();
    if palabras.is_empty() {
        return None;
    }
    let mut tx = estado.db.como_usuario(sesion).await.ok()?;
    let filas = candidatos(&mut tx, None, false).await.ok()?;
    let _ = tx.commit().await;
    let mut halladas: Vec<(f64, &Value)> = filas
        .iter()
        .filter_map(|f| {
            let clase = f["clase"]
                .as_str()
                .map(kepler_core::coco::nombre)
                .unwrap_or_default();
            let nombre = format!("{} {clase}", f["nombre"].as_str().unwrap_or_default());
            let s = palabras
                .iter()
                .map(|p| texto::parecido(p, &nombre))
                .fold(0.0, f64::max);
            (s >= 0.8).then_some((s, f))
        })
        .collect();
    halladas.sort_by(|a, b| b.0.total_cmp(&a.0));
    halladas.truncate(6);
    if halladas.is_empty() {
        return None;
    }
    let lineas: Vec<String> = halladas
        .iter()
        .map(|(_, f)| {
            let mut fecha = f["capturado_en"].clone();
            crate::api::ia_hora_local(&mut fecha, desfase_min);
            format!(
                "- {} «{}»{} · capturado {} · foto: {}",
                f["tipo"].as_str().unwrap_or_default(),
                f["nombre"].as_str().unwrap_or_default(),
                f["nivel"]
                    .as_str()
                    .map(|n| format!(" ({n})"))
                    .unwrap_or_default(),
                fecha.as_str().unwrap_or_default(),
                if f["imagen_path"].is_string() {
                    "sí"
                } else {
                    "no"
                }
            )
        })
        .collect();
    Some(format!(
        "Hallazgos del explorador que podrían ser lo que pregunta (búsqueda previa, admite faltas de ortografía):\n{}",
        lineas.join("\n")
    ))
}

/// Hasta 3 textos distintos con un parecido mínimo, para que Cortex pregunte «¿quizás…?».
fn sugerencias(buscado: &str, textos: impl Iterator<Item = String>) -> Value {
    let mut vistos: Vec<(String, f64)> = Vec::new();
    for t in textos {
        let s = texto::parecido(buscado, &t);
        if s >= SUGERENCIA_MIN
            && !vistos
                .iter()
                .any(|(v, _)| texto::normalizar(v) == texto::normalizar(&t))
        {
            vistos.push((t, s));
        }
    }
    vistos.sort_by(|a, b| b.1.total_cmp(&a.1));
    vistos.truncate(3);
    json!(
        vistos
            .into_iter()
            .map(|(t, s)| json!({ "texto": t, "similitud": redondear(s) }))
            .collect::<Vec<_>>()
    )
}

fn redondear(s: f64) -> f64 {
    (s * 100.0).round() / 100.0
}

/// Fotos de un resultado de `mostrar_imagenes`, para enseñarlas en el chat.
pub fn imagenes(resultado: &Value) -> Vec<Value> {
    resultado["resultados"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|f| f["imagen_path"].is_string())
        .map(|f| {
            json!({ "id": f["id"], "tipo": f["tipo"], "nombre": f["nombre"],
                    "imagen_path": f["imagen_path"], "capturado_en": f["capturado_en"] })
        })
        .collect()
}
