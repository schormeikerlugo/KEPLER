//! Cortex, la IA de KEPLER: chat con herramientas, reporte de novedades y
//! análisis (Deep-Dive) de entradas de la bitácora. Modelos locales en la LAN
//! (`kepler-ai`); las respuestas largas van en streaming NDJSON:
//!
//! ```text
//! {"tipo":"estado","texto":"Consultando misiones…"}
//! {"tipo":"token","texto":"Hola"}
//! {"tipo":"imagenes","items":[{"id","tipo","nombre","imagen_path","capturado_en"}]}
//! {"tipo":"reiniciar"}            ← borrar lo recibido: era un borrador antes de usar herramientas
//! {"tipo":"fin","chat_id":"…","titulo":"…","servidor":"…","segundos":3.2}
//! {"tipo":"error","texto":"…"}
//! ```

use std::time::{Duration, Instant};

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use kepler_ai::{Mensaje, Trozo};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::auth::Sesion;
use crate::error::{ApiError, ApiResult};
use crate::estado::Estado;
use crate::herramientas;

const MENSAJE_MAX: usize = 4000;
/// Rondas de herramientas antes de obligar a responder.
const RONDAS_MAX: usize = 4;
/// Mensajes del historial que se mandan al modelo.
const HISTORIAL_MAX: usize = 20;
const REPORTE_VIGENCIA: Duration = Duration::from_secs(3600);

const PERSONA: &str = "Eres Cortex, la inteligencia artificial del ecosistema de exploración KEPLER. \
Acompañas a un explorador de campo: le ayudas con sus misiones, hallazgos (objetos, personas, puntos \
de interés), rutas, peligros, clima y su estado físico (salud_explorador: pulso, oxígeno, sueño, pasos, \
ánimo, altitud; preparacion: cómo está HOY frente a su normalidad; rendimiento_mision: cómo le fue en \
cada misión). Antes de recomendar una misión o una ruta, consulta su preparación. Es orientación, no \
consejo médico: ante valores preocupantes sugiere descansar o consultar a un profesional. Respondes siempre en español, con tono táctico y directo, en \
frases cortas; usa viñetas cuando ayuden. Usa las herramientas para consultar datos reales del \
explorador en lugar de suponer; si algo no está en los datos, dilo. Nunca inventes cifras, nombres \
ni coordenadas. Las búsquedas toleran faltas de ortografía: si devuelven coincidencias aproximadas o \
sugerencias, preséntalas («No encontré X exactamente, pero sí Y…» o «¿Te refieres a…?») en lugar de \
decir que no existe. Nunca digas que algo no está registrado sin haberlo buscado antes con las \
herramientas (buscar_hallazgos, detalle_mision, listar_misiones). Si el explorador pide ver fotos o imágenes, usa mostrar_imagenes: las fotos se le \
muestran solas; no escribas rutas de archivos.";

#[derive(Debug, Deserialize)]
pub struct PeticionChat {
    chat_id: Option<Uuid>,
    mensaje: String,
    /// Ubicación aproximada del explorador (contexto para clima y peligros).
    lat: Option<f64>,
    lng: Option<f64>,
    /// Desfase horario del dispositivo en minutos (Caracas: -240), para dar las horas en local.
    desfase_min: Option<i32>,
}

/// `POST /v1/ia/chat` — responde en streaming y guarda la conversación.
pub async fn chat(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(p): Json<PeticionChat>,
) -> ApiResult<Response> {
    let mensaje = p.mensaje.trim().to_owned();
    if mensaje.is_empty() || mensaje.chars().count() > MENSAJE_MAX {
        return Err(ApiError::Invalido(format!(
            "el mensaje va de 1 a {MENSAJE_MAX} caracteres"
        )));
    }
    let historial = match p.chat_id {
        Some(id) => cargar_chat(&estado, &sesion, id)
            .await?
            .ok_or(ApiError::NoEncontrado("conversación no encontrada"))?["mensajes"]
            .as_array()
            .cloned()
            .unwrap_or_default(),
        None => Vec::new(),
    };
    let mut mensajes = vec![Mensaje::sistema({
        let mut c = contexto(&estado, &sesion, p.lat, p.lng, p.desfase_min).await;
        if let Some(pistas) = herramientas::pistas(&estado, &sesion, &mensaje, p.desfase_min).await
        {
            c.push_str("\n\n");
            c.push_str(&pistas);
        }
        c
    })];
    let desde = historial.len().saturating_sub(HISTORIAL_MAX);
    for m in &historial[desde..] {
        let texto = m["contenido"].as_str().unwrap_or_default();
        mensajes.push(if m["rol"] == "user" {
            Mensaje::usuario(texto)
        } else {
            Mensaje::asistente(texto)
        });
    }
    mensajes.push(Mensaje::usuario(&mensaje));

    let (tx, rx) = mpsc::channel::<Value>(64);
    tokio::spawn(async move {
        let Some((respuesta, servidor, segundos, imagenes)) =
            conversar(&estado, &sesion, mensajes, p.desfase_min, &tx).await
        else {
            return;
        };
        match guardar_chat(&estado, &sesion, p.chat_id, &mensaje, &respuesta, &imagenes).await {
            Ok((chat_id, titulo)) => {
                let _ = tx
                    .send(json!({ "tipo": "fin", "chat_id": chat_id, "titulo": titulo,
                                  "servidor": servidor, "segundos": segundos }))
                    .await;
            }
            Err(e) => {
                let _ = tx
                    .send(json!({ "tipo": "error", "texto": format!("no se pudo guardar: {e}") }))
                    .await;
            }
        }
    });
    Ok(ndjson(rx))
}

/// Bucle de herramientas + respuesta en streaming. Devuelve el texto final, el
/// servidor, los segundos y las fotos mostradas.
async fn conversar(
    estado: &Estado,
    sesion: &Sesion,
    mut mensajes: Vec<Mensaje>,
    desfase_min: Option<i32>,
    tx: &mpsc::Sender<Value>,
) -> Option<(String, String, f64, Vec<Value>)> {
    let mut imagenes: Vec<Value> = Vec::new();
    let definiciones = herramientas::definiciones();
    let inicio = Instant::now();
    let _ = tx
        .send(json!({ "tipo": "estado", "texto": "Cortex está pensando…" }))
        .await;
    for ronda in 0..=RONDAS_MAX {
        // En la última ronda, sin herramientas: tiene que responder
        let disponibles: &[Value] = if ronda == RONDAS_MAX {
            &[]
        } else {
            &definiciones
        };
        let mut rx = match estado.ia.conversar(&mensajes, disponibles).await {
            Ok(rx) => rx,
            Err(e) => {
                let _ = tx
                    .send(json!({ "tipo": "error", "texto": e.to_string() }))
                    .await;
                return None;
            }
        };
        let (mut texto, mut llamadas, mut servidor) = (String::new(), Vec::new(), String::new());
        while let Some(t) = rx.recv().await {
            match t {
                Ok(Trozo::Texto(s)) => {
                    texto.push_str(&s);
                    if tx
                        .send(json!({ "tipo": "token", "texto": s }))
                        .await
                        .is_err()
                    {
                        return None; // el cliente se fue
                    }
                }
                Ok(Trozo::Herramientas(l)) => llamadas.extend(l),
                Ok(Trozo::Fin { servidor: s, .. }) => servidor = s,
                Err(e) => {
                    let _ = tx
                        .send(json!({ "tipo": "error", "texto": e.to_string() }))
                        .await;
                    return None;
                }
            }
        }
        if llamadas.is_empty() {
            return Some((
                texto.trim().to_owned(),
                servidor,
                inicio.elapsed().as_secs_f64(),
                imagenes,
            ));
        }
        if !texto.trim().is_empty() {
            // Lo dicho antes de pedir herramientas es un borrador: el cliente lo borra
            let _ = tx.send(json!({ "tipo": "reiniciar" })).await;
        }
        mensajes.push(Mensaje {
            tool_calls: llamadas.clone(),
            ..Mensaje::asistente(texto)
        });
        for l in llamadas {
            let _ = tx
                .send(json!({ "tipo": "estado", "texto": describir(&l.function.name), "herramienta": l.function.name }))
                .await;
            // El desfase horario del explorador (para «hoy») lo pone el servidor, no el modelo
            let mut args = l.function.arguments.clone();
            if let (Some(o), Some(m)) = (args.as_object_mut(), desfase_min) {
                o.insert("_desfase_min".into(), json!(m));
            }
            let resultado = herramientas::ejecutar(estado, sesion, &l.function.name, &args).await;
            tracing::info!(herramienta = %l.function.name, args = %l.function.arguments,
                           total = %resultado["total"], "cortex: herramienta");
            if l.function.name == "mostrar_imagenes" {
                let nuevas: Vec<Value> = herramientas::imagenes(&resultado)
                    .into_iter()
                    .filter(|i| !imagenes.iter().any(|v| v["id"] == i["id"]))
                    .collect();
                if !nuevas.is_empty() {
                    let _ = tx
                        .send(json!({ "tipo": "imagenes", "items": nuevas }))
                        .await;
                    imagenes.extend(nuevas);
                }
            }
            // Al modelo, las fechas ya en hora local (los modelos pequeños no convierten bien)
            let mut para_modelo = resultado;
            a_hora_local(&mut para_modelo, desfase_min);
            mensajes.push(Mensaje::herramienta(&l.function.name, &para_modelo));
        }
    }
    None
}

/// Sustituye las fechas RFC 3339 del resultado por «AAAA-MM-DD HH:MM» en la hora
/// local del explorador (sin desfase conocido, se dejan en UTC).
pub fn a_hora_local(v: &mut Value, desfase_min: Option<i32>) {
    let Some(m) = desfase_min.filter(|m| m.abs() <= 14 * 60) else {
        return;
    };
    match v {
        Value::String(s) => {
            if let Ok(t) = chrono::DateTime::parse_from_rfc3339(s) {
                let local = t.with_timezone(&Utc) + chrono::Duration::minutes(i64::from(m));
                *s = local.format("%Y-%m-%d %H:%M").to_string();
            }
        }
        Value::Array(a) => a.iter_mut().for_each(|x| a_hora_local(x, desfase_min)),
        Value::Object(o) => o.values_mut().for_each(|x| a_hora_local(x, desfase_min)),
        _ => {}
    }
}

fn describir(herramienta: &str) -> &'static str {
    match herramienta {
        "resumen_explorador" => "Revisando tu resumen…",
        "listar_misiones" => "Consultando misiones…",
        "detalle_mision" => "Abriendo la misión…",
        "buscar_hallazgos" => "Buscando en tus hallazgos…",
        "mostrar_imagenes" => "Buscando las fotos…",
        "peligros_cercanos" => "Buscando peligros cercanos…",
        "clima" => "Consultando el clima…",
        "salud_explorador" => "Revisando tu salud…",
        "preparacion" => "Calculando tu preparación…",
        "rendimiento_mision" => "Analizando tu rendimiento…",
        _ => "Consultando datos…",
    }
}

/// Instrucciones + lo mínimo del explorador (el resto lo piden las herramientas).
async fn contexto(
    estado: &Estado,
    sesion: &Sesion,
    lat: Option<f64>,
    lng: Option<f64>,
    desfase_min: Option<i32>,
) -> String {
    let nombre: Option<String> = match estado.db.como_usuario(sesion).await {
        Ok(mut tx) => {
            let n = sqlx::query_scalar("select coalesce(nombre_visible, nombre_usuario) from public.perfiles where id = $1")
                .bind(sesion.user_id)
                .fetch_optional(&mut *tx)
                .await
                .ok()
                .flatten();
            let _ = tx.commit().await;
            n
        }
        Err(_) => None,
    };
    // Los datos vienen en UTC: con el desfase del dispositivo, Cortex habla en hora local
    let ahora = match desfase_min.filter(|m| m.abs() <= 14 * 60) {
        Some(m) => {
            let local = Utc::now() + chrono::Duration::minutes(i64::from(m));
            let signo = if m < 0 { '-' } else { '+' };
            format!(
                "{} (hora local del explorador, UTC{signo}{}:{:02}). Las fechas de las herramientas ya están en \
                 su hora local: úsalas tal cual y no escribas «UTC»",
                local.format("%Y-%m-%d %H:%M"),
                m.abs() / 60,
                m.abs() % 60
            )
        }
        None => Utc::now().format("%Y-%m-%d %H:%M UTC").to_string(),
    };
    let ubicacion = match (lat, lng) {
        (Some(lat), Some(lng)) => {
            format!("Ubicación aproximada del explorador: {lat:.4}, {lng:.4}.")
        }
        _ => "Ubicación del explorador desconocida.".into(),
    };
    format!(
        "{PERSONA}\n\nExplorador: {}. Fecha y hora: {ahora}. {ubicacion}",
        nombre.unwrap_or_else(|| "desconocido".into())
    )
}

async fn cargar_chat(estado: &Estado, sesion: &Sesion, id: Uuid) -> ApiResult<Option<Value>> {
    let mut tx = estado.db.como_usuario(sesion).await?;
    let fila: Option<Value> = sqlx::query_scalar(
        "select to_jsonb(c) from public.chat_sesiones c where id = $1 and eliminado_en is null",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(fila)
}

/// Añade la pregunta y la respuesta; una conversación nueva recibe título.
async fn guardar_chat(
    estado: &Estado,
    sesion: &Sesion,
    chat_id: Option<Uuid>,
    pregunta: &str,
    respuesta: &str,
    imagenes: &[Value],
) -> ApiResult<(Uuid, String)> {
    let ahora = Utc::now();
    let mut asistente = json!({ "rol": "assistant", "contenido": respuesta, "en": ahora });
    if !imagenes.is_empty() {
        asistente["imagenes"] = json!(imagenes);
    }
    let nuevos = json!([{ "rol": "user", "contenido": pregunta, "en": ahora }, asistente]);
    let titulo = match chat_id {
        Some(_) => None,
        None => Some(titular(estado, pregunta).await),
    };
    let mut tx = estado.db.como_usuario(sesion).await?;
    let (id, titulo): (Uuid, Option<String>) = match chat_id {
        Some(id) => sqlx::query_as(
            "update public.chat_sesiones set mensajes = mensajes || $2 where id = $1 returning id, titulo",
        )
        .bind(id)
        .bind(&nuevos)
        .fetch_one(&mut *tx)
        .await?,
        None => sqlx::query_as(
            "insert into public.chat_sesiones (id, titulo, mensajes) values ($1, $2, $3) returning id, titulo",
        )
        .bind(kepler_core::nuevo_id())
        .bind(&titulo)
        .bind(&nuevos)
        .fetch_one(&mut *tx)
        .await?,
    };
    tx.commit().await?;
    Ok((id, titulo.unwrap_or_default()))
}

/// Título corto con emoji (si la IA falla, el principio de la pregunta).
async fn titular(estado: &Estado, pregunta: &str) -> String {
    let respaldo: String = pregunta.chars().take(40).collect();
    let pedido = format!(
        "Escribe un título de máximo 5 palabras, en español, que empiece con un emoji acorde al tema, \
         para una conversación que empieza así: «{pregunta}». Responde solo con el título, sin comillas."
    );
    match estado.ia.completar(&[Mensaje::usuario(pedido)]).await {
        Ok(t) if !t.is_empty() => t
            .lines()
            .next()
            .unwrap_or(&t)
            .trim_matches(['"', '«', '»', ' '])
            .chars()
            .take(60)
            .collect(),
        _ => respaldo,
    }
}

/// `GET /v1/ia/chats` — conversaciones, la más reciente primero.
pub async fn chats(State(estado): State<Estado>, sesion: Sesion) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let v: Value = sqlx::query_scalar(
        "select coalesce(jsonb_agg(c order by c.actualizado_en desc), '[]') from (
            select id, titulo, actualizado_en, jsonb_array_length(mensajes) as mensajes
            from public.chat_sesiones where eliminado_en is null
            order by actualizado_en desc limit 100) c",
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(v))
}

/// `GET /v1/ia/chats/{id}`
pub async fn chat_detalle(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    cargar_chat(&estado, &sesion, id)
        .await?
        .map(Json)
        .ok_or(ApiError::NoEncontrado("conversación no encontrada"))
}

/// `DELETE /v1/ia/chats/{id}` — borrado lógico (se propaga por sync).
pub async fn borrar_chat(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let n = sqlx::query("update public.chat_sesiones set eliminado_en = now() where id = $1 and eliminado_en is null")
        .bind(id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    tx.commit().await?;
    if n == 0 {
        return Err(ApiError::NoEncontrado("conversación no encontrada"));
    }
    Ok(Json(json!({ "borrado": id })))
}

#[derive(Debug, Deserialize)]
pub struct ParamsReporte {
    lat: Option<f64>,
    lng: Option<f64>,
    #[serde(default)]
    forzar: bool,
}

/// `GET /v1/ia/reporte?lat=&lng=&forzar=` — «Novedades de Cortex»: tiempo y
/// estado, hallazgos y sugerencia de exploración. En caché 1 h por explorador.
pub async fn reporte(
    State(estado): State<Estado>,
    sesion: Sesion,
    Query(p): Query<ParamsReporte>,
) -> ApiResult<Json<Value>> {
    if !p.forzar
        && let Some((t, v)) = estado
            .reportes
            .lock()
            .expect("reportes")
            .get(&sesion.user_id)
        && t.elapsed() < REPORTE_VIGENCIA
    {
        return Ok(Json(v.clone()));
    }
    let datos = datos_reporte(&estado, &sesion, p.lat, p.lng).await?;
    let pedido = format!(
        "Genera el «Reporte de novedades» del explorador con estos datos reales (JSON):\n{datos}\n\n\
         Organízalo EXACTAMENTE en tres secciones Markdown, cada una de 2-3 viñetas cortas:\n\
         ### 🌤️ Lecturas del tiempo y estado\n(clima en su zona y cómo encaja con su resistencia y su calzado)\n\
         ### 🔍 Noticias sobre hallazgos\n(lo registrado recientemente; si no hay nada, anímalo a documentar)\n\
         ### 🗺️ Sugerencia de exploración\n(qué hacer hoy según equipo, clima y peligros; menciona peligros si los hay)\n\
         No inventes nada fuera de los datos."
    );
    let texto = estado
        .ia
        .completar(&[Mensaje::sistema(PERSONA), Mensaje::usuario(pedido)])
        .await
        .map_err(|e| ApiError::Interno(e.to_string()))?;
    let v = json!({ "reporte": texto, "generado_en": Utc::now(), "modelo": estado.ia.modelo() });
    estado
        .reportes
        .lock()
        .expect("reportes")
        .insert(sesion.user_id, (Instant::now(), v.clone()));
    Ok(Json(v))
}

async fn datos_reporte(
    estado: &Estado,
    sesion: &Sesion,
    lat: Option<f64>,
    lng: Option<f64>,
) -> ApiResult<Value> {
    let clima = match (lat, lng) {
        (Some(lat), Some(lng)) => estado.externos.clima(lat, lng).await.ok().map(|c| {
            json!({ "lugar": c.ubicacion, "temperatura_c": c.temperatura_c, "categoria": c.categoria,
                    "lluvia_mm": c.lluvia_mm, "viento_kmh": c.viento_kmh, "uv": c.uv, "es_dia": c.es_dia })
        }),
        _ => None,
    };
    let mut tx = estado.db.como_usuario(sesion).await?;
    let mut datos: Value = sqlx::query_scalar(
        "select jsonb_build_object(
            'hallazgos_recientes', (select coalesce(jsonb_agg(h), '[]') from (
                select 'objeto' as tipo, nombre, capturado_en from public.objetos
                 where user_id = (select auth.uid()) and eliminado_en is null
                union all select 'persona', nombre || ' (' || hostilidad || ')', capturado_en from public.personas where eliminado_en is null
                union all select 'poi', nombre || ' (riesgo ' || nivel_riesgo || ')', capturado_en from public.puntos_interes
                 where user_id = (select auth.uid()) and eliminado_en is null
                order by capturado_en desc limit 6) h),
            'peligros', (select coalesce(jsonb_agg(p), '[]') from (
                select nombre, nivel_riesgo, zona from public.puntos_interes
                where eliminado_en is null and estado <> 'inactivo' and nivel_riesgo in ('alto', 'critico')
                order by capturado_en desc limit 5) p),
            'personas_hostiles_reportadas', (select count(*) from public.alertas_personas),
            'zonas_recientes', (select coalesce(jsonb_agg(distinct zona), '[]') from (
                select zona from public.misiones where eliminado_en is null and zona is not null
                order by creado_en desc limit 5) z),
            'misiones_completadas', (select count(*) from public.misiones where eliminado_en is null and estado = 'completada'),
            'calzado_reset_en', (select calzado_reset_en from public.perfiles where id = (select auth.uid())))",
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    datos["clima"] = clima.unwrap_or(Value::Null);
    Ok(datos)
}

#[derive(Debug, Deserialize)]
pub struct PeticionAnalisis {
    notificacion_id: Uuid,
    lat: Option<f64>,
    lng: Option<f64>,
    desfase_min: Option<i32>,
}

/// `POST /v1/ia/analizar` — Deep-Dive de una entrada de la bitácora (streaming).
pub async fn analizar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Json(p): Json<PeticionAnalisis>,
) -> ApiResult<Response> {
    let mut tx = estado.db.como_usuario(&sesion).await?;
    let entrada: Option<Value> = sqlx::query_scalar(
        "select jsonb_build_object('mensaje', mensaje, 'tipo', tipo, 'contexto', contexto, 'creado_en', creado_en)
         from public.notificaciones where id = $1 and eliminado_en is null",
    )
    .bind(p.notificacion_id)
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    let entrada = entrada.ok_or(ApiError::NoEncontrado("entrada de bitácora no encontrada"))?;
    let pedido = format!(
        "Analiza en profundidad esta entrada de la bitácora del explorador:\n{entrada}\n\n\
         Usa las herramientas para traer el contexto relacionado (la misión, el hallazgo, peligros en la \
         zona, el clima). Responde en Markdown con: ### Qué pasó, ### Por qué importa y ### Qué hacer \
         ahora (acciones concretas). Sé breve."
    );
    let mensajes = vec![
        Mensaje::sistema(contexto(&estado, &sesion, p.lat, p.lng, p.desfase_min).await),
        Mensaje::usuario(pedido),
    ];
    let (tx, rx) = mpsc::channel::<Value>(64);
    tokio::spawn(async move {
        if let Some((_, servidor, segundos, _)) =
            conversar(&estado, &sesion, mensajes, p.desfase_min, &tx).await
        {
            let _ = tx
                .send(json!({ "tipo": "fin", "servidor": servidor, "segundos": segundos }))
                .await;
        }
    });
    Ok(ndjson(rx))
}

/// `POST /v1/ia/documentar/{mision_id}` — Cortex redacta el reporte de una
/// misión con sus datos reales y lo guarda en `misiones.descripcion_ia`.
pub async fn documentar(
    State(estado): State<Estado>,
    sesion: Sesion,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let codigo: Option<String> = {
        let mut tx = estado.db.como_usuario(&sesion).await?;
        let c = sqlx::query_scalar(
            "select codigo from public.misiones where id = $1 and eliminado_en is null",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
        c
    };
    let codigo = codigo.ok_or(ApiError::NoEncontrado("misión no encontrada"))?;
    let datos = herramientas::ejecutar(
        &estado,
        &sesion,
        "detalle_mision",
        &json!({ "mision": codigo }),
    )
    .await;
    let pedido = format!(
        "Redacta el reporte de esta misión de exploración con sus datos reales (JSON):\n{datos}\n\n\
         Formato Markdown, conciso, en tono táctico: ### Resumen (2-3 frases: dónde, cuánto, cuánto tiempo, \
         clima al despegar), ### Hallazgos (viñetas; si no hubo, dilo) y ### Observaciones (riesgos, \
         recomendaciones para volver). No inventes nada fuera de los datos."
    );
    let texto = estado
        .ia
        .completar(&[Mensaje::sistema(PERSONA), Mensaje::usuario(pedido)])
        .await
        .map_err(|e| ApiError::Interno(e.to_string()))?;
    if texto.is_empty() {
        return Err(ApiError::Interno("la IA no devolvió texto".into()));
    }
    let mut tx = estado.db.como_usuario(&sesion).await?;
    sqlx::query("update public.misiones set descripcion_ia = $2 where id = $1")
        .bind(id)
        .bind(&texto)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({ "descripcion_ia": texto, "modelo": estado.ia.modelo() }),
    ))
}

/// Respuesta NDJSON alimentada por un canal.
fn ndjson(rx: mpsc::Receiver<Value>) -> Response {
    let flujo = futures_util::stream::unfold(rx, |mut rx| async move {
        let v = rx.recv().await?;
        Some((Ok::<_, std::convert::Infallible>(format!("{v}\n")), rx))
    });
    (
        [
            (header::CONTENT_TYPE, "application/x-ndjson"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        Body::from_stream(flujo),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fechas_a_hora_local() {
        let mut v = json!({ "resultados": [{ "capturado_en": "2026-11-02T17:18:30.5Z", "nombre": "2026" }] });
        a_hora_local(&mut v, Some(-240));
        assert_eq!(v["resultados"][0]["capturado_en"], "2026-11-02 13:18");
        assert_eq!(v["resultados"][0]["nombre"], "2026");
        let mut sin = json!("2026-11-02T17:18:30Z");
        a_hora_local(&mut sin, None);
        assert_eq!(sin, "2026-11-02T17:18:30Z");
    }
}
