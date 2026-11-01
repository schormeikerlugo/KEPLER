//! Prueba de punta a punta contra un stack desplegado (no corre en `cargo test`).
//!
//! Requiere dos cuentas creadas con `create-user.sh` y estas variables:
//!   KEPLER_E2E_API=http://192.168.68.117:8000
//!   KEPLER_E2E_AUTH=http://192.168.68.117:54321   (gateway, para leer Storage)
//!   KEPLER_E2E_ANON=<ANON_KEY>
//!   KEPLER_E2E_USUARIOS=e2e_uno,e2e_dos
//!   KEPLER_E2E_PASSWORD=<contraseña de ambas>
//!   KEPLER_E2E_MODELOS=models/onnx   (para prueba-bus.jpg)
//!
//!   cargo test -p kepler-server --test e2e -- --ignored --nocapture

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use kepler_proto::v1::{
    Caja, Deteccion, Detecciones, Fotograma, Hola, MuestraGps, OrigenDeteccion, Suscripcion,
    TipoCliente, TipoEventoMision,
};
use kepler_proto::{Contenido, Emisor, Envoltura, codificar, decodificar, uuid_a_bytes};
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

fn var(k: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| panic!("falta {k}"))
}

struct Cuenta {
    token: String,
    refresh: String,
}

/// Login por usuario a través de `/v1/sesion` (el servidor reenvía a Auth).
async fn login(http: &Client, usuario: &str) -> Cuenta {
    let r: Value = http
        .post(format!("{}/v1/sesion", var("KEPLER_E2E_API")))
        .json(&json!({ "usuario": usuario, "contrasena": var("KEPLER_E2E_PASSWORD") }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(r["usuario"].as_str(), Some(usuario));
    Cuenta {
        token: r["access_token"].as_str().expect("login").to_owned(),
        refresh: r["refresh_token"].as_str().expect("refresh").to_owned(),
    }
}

struct Api {
    http: Client,
    base: String,
}

impl Api {
    async fn pedir(
        &self,
        c: &Cuenta,
        metodo: reqwest::Method,
        ruta: &str,
        cuerpo: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut req = self
            .http
            .request(metodo, format!("{}{ruta}", self.base))
            .bearer_auth(&c.token);
        if let Some(b) = cuerpo {
            req = req.json(&b);
        }
        let r = req.send().await.unwrap();
        let estado = r.status();
        (estado, r.json().await.unwrap_or(Value::Null))
    }
    async fn get(&self, c: &Cuenta, ruta: &str) -> (StatusCode, Value) {
        self.pedir(c, reqwest::Method::GET, ruta, None).await
    }
    async fn post(&self, c: &Cuenta, ruta: &str, cuerpo: Value) -> (StatusCode, Value) {
        self.pedir(c, reqwest::Method::POST, ruta, Some(cuerpo))
            .await
    }
}

async fn conectar_ws(c: &Cuenta, tipo: TipoCliente, emisor: &mut Emisor) -> (Ws, Uuid) {
    conectar_ws_con(c, tipo, emisor, false).await
}

async fn conectar_ws_con(
    c: &Cuenta,
    tipo: TipoCliente,
    emisor: &mut Emisor,
    deteccion_servidor: bool,
) -> (Ws, Uuid) {
    let url = var("KEPLER_E2E_API").replace("http", "ws") + "/v1/en-vivo";
    let mut req = url.into_client_request().unwrap();
    req.headers_mut().insert(
        "authorization",
        format!("Bearer {}", c.token).parse().unwrap(),
    );
    let (mut ws, _) = tokio_tungstenite::connect_async(req).await.expect("ws");
    let hola = Hola {
        version_protocolo: 1,
        tipo: tipo.into(),
        dispositivo: "e2e".into(),
        version_app: "0.8.0".into(),
        deteccion_servidor,
    };
    enviar(&mut ws, emisor, hola).await;
    let Some(Contenido::Bienvenida(b)) = recibir(&mut ws).await.and_then(|e| e.contenido) else {
        panic!("sin bienvenida")
    };
    (ws, Uuid::from_slice(&b.sesion_id).unwrap())
}

async fn enviar(ws: &mut Ws, emisor: &mut Emisor, c: impl Into<Contenido>) -> u64 {
    let e = emisor.envolver(c, chrono::Utc::now().timestamp_millis());
    ws.send(Message::Binary(codificar(&e).into()))
        .await
        .unwrap();
    e.secuencia
}

async fn recibir(ws: &mut Ws) -> Option<Envoltura> {
    loop {
        match tokio::time::timeout(Duration::from_secs(3), ws.next())
            .await
            .ok()??
        {
            Ok(Message::Binary(b)) => return Some(decodificar(&b).expect("protobuf")),
            Ok(_) => continue,
            Err(_) => return None,
        }
    }
}

async fn nada_en(ws: &mut Ws, ms: u64) -> bool {
    tokio::time::timeout(Duration::from_millis(ms), ws.next())
        .await
        .is_err()
}

/// Descarta lo pendiente en el socket.
async fn vaciar(ws: &mut Ws) {
    while !nada_en(ws, 300).await {}
}

fn ok(paso: &str) {
    println!("  ✅ {paso}");
}

#[tokio::test]
#[ignore = "requiere un stack desplegado y cuentas de prueba"]
async fn punta_a_punta() {
    let http = Client::new();
    let api = Api {
        http: http.clone(),
        base: var("KEPLER_E2E_API"),
    };
    let usuarios = var("KEPLER_E2E_USUARIOS");
    let (u1, u2) = usuarios.split_once(',').unwrap();

    // --- salud y sesión
    let salud: Value = http
        .get(format!("{}/health", api.base))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(salud["base_datos"]["ok"], true);
    ok(&format!("/health: {}", salud["estado"]));

    let yo = login(&http, u1).await;
    let otro = login(&http, u2).await;
    let (s, perfil) = api.get(&yo, "/v1/yo").await;
    assert_eq!(
        (s, perfil["nombre_usuario"].as_str()),
        (StatusCode::OK, Some(u1))
    );
    ok("login por usuario y /v1/yo");

    let r = http
        .post(format!("{}/v1/sesion", api.base))
        .json(&json!({ "usuario": u1, "contrasena": "incorrecta-123" }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::UNAUTHORIZED);
    let r: Value = http
        .post(format!("{}/v1/sesion/renovar", api.base))
        .json(&json!({ "refresh_token": yo.refresh }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let yo = Cuenta {
        token: r["access_token"].as_str().expect("renovar").to_owned(),
        refresh: r["refresh_token"].as_str().unwrap().to_owned(),
    };
    assert_eq!(api.get(&yo, "/v1/yo").await.0, StatusCode::OK);
    ok("contraseña incorrecta → 401 y renovación del token");

    let (_, cat) = api.get(&yo, "/v1/catalogos").await;
    assert_eq!(cat["categorias"].as_array().unwrap().len(), 13);
    assert_eq!(cat["poi_categorias"].as_array().unwrap().len(), 4);
    ok("catálogos");

    // --- en vivo: centro de control (yo), unidad de campo (yo), centro de control ajeno (otro)
    let mut e_cc = Emisor::default();
    let mut e_campo = Emisor::default();
    let mut e_ajeno = Emisor::default();
    let (mut cc, _) = conectar_ws(&yo, TipoCliente::CentroControl, &mut e_cc).await;
    let (mut campo, sesion_campo) = conectar_ws(&yo, TipoCliente::UnidadCampo, &mut e_campo).await;
    let (mut ajeno, _) = conectar_ws(&otro, TipoCliente::CentroControl, &mut e_ajeno).await;
    enviar(
        &mut cc,
        &mut e_cc,
        Suscripcion {
            sesion_id: vec![],
            fotogramas: true,
        },
    )
    .await;
    tokio::time::sleep(Duration::from_millis(200)).await;
    ok("3 conexiones WebSocket con Hola/Bienvenida");

    // --- misión: crear e iniciar
    let (s, m) = api
        .post(
            &yo,
            "/v1/misiones",
            json!({ "titulo": "E2E", "iniciar": true, "lat": 10.48, "lng": -66.9 }),
        )
        .await;
    assert_eq!(s, StatusCode::CREATED, "{m}");
    assert_eq!(m["estado"], "activa");
    let mision: Uuid = m["id"].as_str().unwrap().parse().unwrap();
    let Some(Contenido::Mision(ev)) = recibir(&mut cc).await.and_then(|e| e.contenido) else {
        panic!("sin evento")
    };
    assert_eq!(ev.tipo(), TipoEventoMision::Iniciada);
    let _ = recibir(&mut campo).await; // la unidad de campo también recibe el evento
    ok(&format!("misión {} iniciada + evento en vivo", m["codigo"]));

    // --- GPS por WebSocket: Ack al campo, reenvío al centro de control
    for i in 0..3 {
        let id = Uuid::now_v7();
        let gps = MuestraGps {
            id: uuid_a_bytes(id),
            mision_id: uuid_a_bytes(mision),
            lat: 10.48 + 0.001 * f64::from(i),
            lng: -66.9,
            altitud: Some(900.0),
            velocidad: Some(1.5),
            rumbo: None,
            precision_m: Some(5.0),
            registrado_ms: chrono::Utc::now().timestamp_millis() + i64::from(i) * 60_000,
        };
        let seq = enviar(&mut campo, &mut e_campo, gps).await;
        let Some(Contenido::Ack(a)) = recibir(&mut campo).await.and_then(|e| e.contenido) else {
            panic!("sin ack")
        };
        assert_eq!(a.secuencia, seq);
        let relevo = recibir(&mut cc).await.unwrap();
        assert!(matches!(relevo.contenido, Some(Contenido::Gps(_))));
        assert_eq!(
            Uuid::from_slice(&relevo.origen_sesion).unwrap(),
            sesion_campo
        );
    }
    ok("3 muestras GPS: guardadas (Ack) y reenviadas con origen_sesion");

    // --- detecciones y fotograma
    let det = Detecciones {
        mision_id: uuid_a_bytes(mision),
        fotograma: 1,
        ancho: 1920,
        alto: 1440,
        items: vec![Deteccion {
            clase: "rock".into(),
            confianza: 0.9,
            caja: Some(Caja {
                x: 0.1,
                y: 0.1,
                ancho: 0.2,
                alto: 0.2,
            }),
            track_id: Some(4),
            distancia_m: Some(2.5),
        }],
        origen: OrigenDeteccion::Dispositivo.into(),
        latencia_ms: 15.0,
    };
    enviar(&mut campo, &mut e_campo, det).await;
    assert!(matches!(
        recibir(&mut cc).await.unwrap().contenido,
        Some(Contenido::Detecciones(_))
    ));
    enviar(
        &mut campo,
        &mut e_campo,
        Fotograma {
            numero: 1,
            jpeg: vec![0xff, 0xd8, 0xff],
            ancho: 4,
            alto: 3,
        },
    )
    .await;
    assert!(matches!(
        recibir(&mut cc).await.unwrap().contenido,
        Some(Contenido::Fotograma(_))
    ));
    ok("detecciones y fotograma reenviados al centro de control");

    assert!(
        nada_en(&mut ajeno, 800).await,
        "el otro usuario recibió datos ajenos"
    );
    ok("aislamiento en vivo: el otro usuario no recibe nada");

    // --- rastro: lectura e idempotencia por REST
    let (_, rastro) = api.get(&yo, &format!("/v1/misiones/{mision}/rastro")).await;
    assert_eq!(rastro.as_array().unwrap().len(), 3);
    let reenvio: Vec<Value> = rastro
        .as_array()
        .unwrap()
        .iter()
        .map(|p| json!({ "id": p["id"], "lat": p["lat"], "lng": p["lng"], "registrado_en": p["registrado_en"] }))
        .collect();
    let (_, r) = api
        .post(
            &yo,
            &format!("/v1/misiones/{mision}/rastro"),
            json!(reenvio),
        )
        .await;
    assert_eq!(
        (r["recibidos"].as_u64(), r["insertados"].as_u64()),
        (Some(3), Some(0))
    );
    ok("rastro: 3 puntos, reenvío idempotente (0 insertados)");

    // --- completar
    let (s, m) = api
        .post(
            &yo,
            &format!("/v1/misiones/{mision}/completar"),
            json!(null),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{m}");
    assert_eq!(m["estado"], "completada");
    assert!(m["distancia_m"].as_f64().unwrap() > 200.0);
    assert_eq!(m["duracion_s"], 120);
    let Some(Contenido::Mision(ev)) = recibir(&mut cc).await.and_then(|e| e.contenido) else {
        panic!()
    };
    assert_eq!(ev.tipo(), TipoEventoMision::Completada);
    let (s, _) = api
        .post(
            &yo,
            &format!("/v1/misiones/{mision}/completar"),
            json!(null),
        )
        .await;
    assert_eq!(s, StatusCode::CONFLICT);
    ok(&format!(
        "completada: {:.0} m en {} s; repetir → 409",
        m["distancia_m"].as_f64().unwrap(),
        m["duracion_s"]
    ));

    // --- aislamiento REST
    let (s, _) = api.get(&otro, &format!("/v1/misiones/{mision}")).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    ok("el otro usuario no ve la misión (404)");

    // --- sincronización: subir hallazgos creados offline
    let ahora = chrono::Utc::now();
    let objeto_id = kepler_core::nuevo_id();
    let objeto = json!({
        "id": objeto_id, "mision_id": mision, "nombre": "Cuarzo", "clase_yolo": "rock",
        "confianza": 0.91, "lat": 10.4806, "lng": -66.9036, "distancia_m": 2.4,
        "embedding": vec![0.01f32; 512], "atributos": {}, "contexto_ambiental": {},
        "capturado_en": ahora, "creado_en": ahora, "actualizado_en": ahora, "version": 1
    });
    let persona = json!({
        "id": kepler_core::nuevo_id(), "mision_id": mision, "nombre": "Persona E2E", "hostilidad": "neutral",
        "capturado_en": ahora, "creado_en": ahora, "actualizado_en": ahora, "version": 1
    });
    let mala =
        json!({ "id": kepler_core::nuevo_id(), "nombre": "Mal POI", "nivel_riesgo": "extremo" });
    let (s, r) = api
        .post(
            &yo,
            "/v1/sync/subir",
            json!({
                "objetos": [objeto], "personas": [persona], "puntos_interes": [mala]
            }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{r}");
    assert_eq!(r["aplicados"]["objetos"].as_array().unwrap().len(), 1);
    assert_eq!(r["aplicados"]["personas"].as_array().unwrap().len(), 1);
    assert_eq!(r["rechazados"].as_array().unwrap().len(), 1);
    let servidor = r["aplicados"]["objetos"][0].clone();
    ok("subir: 2 aplicados, 1 rechazado por validación (sin abortar el lote)");

    // Reenviar lo mismo: sin conflicto
    let (_, r) = api
        .post(
            &yo,
            "/v1/sync/subir",
            json!({ "objetos": [servidor.clone()] }),
        )
        .await;
    assert!(r["conflictos"].as_array().unwrap().is_empty(), "{r}");
    ok("reenvío idempotente sin conflicto");

    // Edición offline normal (versión + 1): se aplica
    let mut editado = servidor.clone();
    editado["nombre"] = json!("Cuarzo rosa");
    editado["version"] = json!(servidor["version"].as_i64().unwrap() + 1);
    let (_, r) = api
        .post(&yo, "/v1/sync/subir", json!({ "objetos": [editado] }))
        .await;
    assert_eq!(r["aplicados"]["objetos"][0]["nombre"], "Cuarzo rosa");
    assert!(r["conflictos"].as_array().unwrap().is_empty());
    let v_actual = r["aplicados"]["objetos"][0]["version"].as_i64().unwrap();
    assert!(
        r["aplicados"]["objetos"][0]["embedding"].is_string(),
        "el embedding no debe perderse"
    );
    ok(&format!(
        "edición offline aplicada (versión {v_actual}), embedding conservado"
    ));

    // Edición concurrente desde una versión vieja: gana el servidor
    let mut viejo = servidor.clone();
    viejo["nombre"] = json!("Pirita");
    let (_, r) = api
        .post(&yo, "/v1/sync/subir", json!({ "objetos": [viejo] }))
        .await;
    assert_eq!(r["conflictos"][0]["ganador"], "servidor", "{r}");
    assert_eq!(r["aplicados"]["objetos"][0]["nombre"], "Cuarzo rosa");
    ok("conflicto con versión vieja: gana el servidor");

    // Otro usuario intentando usar el mismo id
    let (_, r) = api
        .post(&otro, "/v1/sync/subir", json!({ "objetos": [servidor] }))
        .await;
    assert_eq!(r["rechazados"].as_array().unwrap().len(), 1, "{r}");
    ok("otro usuario no puede pisar el id (rechazado)");

    // --- bajar cambios
    let (_, c) = api.get(&yo, "/v1/sync/cambios").await;
    assert_eq!(c["completo"], true);
    let objetos = c["tablas"]["objetos"].as_array().unwrap();
    assert!(objetos.iter().any(|o| o["id"] == json!(objeto_id)));
    assert!(
        objetos[0].get("embedding").is_none(),
        "sin embeddings por defecto"
    );
    assert_eq!(c["tablas"]["rastro_gps"].as_array().unwrap().len(), 3);
    let cursor = c["cursor"].as_str().unwrap().to_owned();
    let (_, c2) = api.get(&otro, "/v1/sync/cambios").await;
    assert!(c2["tablas"]["objetos"].as_array().unwrap().is_empty());
    ok("bajar cambios: datos propios completos, el otro usuario no ve nada");

    let (_, c3) = api
        .get(
            &yo,
            &format!("/v1/sync/cambios?desde={}", urlencode(&cursor)),
        )
        .await;
    assert!(c3["tablas"]["misiones"].as_array().unwrap().len() <= 1);
    ok("cursor incremental");

    // ===== 4b: entorno, explorador, dashboard, rutas y mapas =====

    let (s, clima) = api.get(&yo, "/v1/clima?lat=10.4806&lng=-66.9036").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(clima["disponible"], true, "{clima}");
    assert!(clima["temperatura_c"].is_number() && clima["categoria"].is_string());
    ok(&format!(
        "clima: {} {}°C · {} (fatiga ×{})",
        clima["ubicacion"],
        clima["temperatura_c"],
        clima["categoria"],
        clima["multiplicador_fatiga"]
    ));
    assert_eq!(
        m["clima"]["categoria"], clima["categoria"],
        "la misión guardó el clima al despegar"
    );
    ok("la misión guardó la instantánea del clima al despegar");

    let (_, aire) = api.get(&yo, "/v1/aire?lat=10.4806&lng=-66.9036").await;
    assert_eq!(aire["disponible"], true, "{aire}");
    ok(&format!(
        "aire: AQI {} · {} · aire {}%",
        aire["aqi"], aire["calidad"], aire["aire_pct"]
    ));

    let (_, ip) = api.get(&yo, "/v1/geo/ip").await;
    assert_eq!(ip["disponible"], true, "{ip}");
    assert!(ip["lat"].is_number() && ip["lng"].is_number());
    ok(&format!(
        "geo IP: {} ({}, {})",
        ip["ciudad"], ip["lat"], ip["lng"]
    ));

    let (s, exp) = api
        .get(&yo, "/v1/explorador?lat=10.4806&lng=-66.9036")
        .await;
    assert_eq!(s, StatusCode::OK, "{exp}");
    assert_eq!(exp["misiones_completadas"], 1);
    assert_eq!(exp["distancia_total_km"], 0.2);
    let resistencia = exp["resistencia"].as_f64().unwrap();
    assert!((0.0..=100.0).contains(&resistencia));
    let (s, reset) = api.post(&yo, "/v1/explorador/calzado", json!(null)).await;
    assert_eq!(s, StatusCode::OK);
    assert!(reset["calzado_reset_en"].is_string());
    ok(&format!(
        "explorador: calzado {}%, resistencia {resistencia}%, reset de calzado",
        exp["desgaste_calzado"]
    ));

    let (s, dash) = api.get(&yo, "/v1/dashboard?zona=America/Caracas").await;
    assert_eq!(s, StatusCode::OK, "{dash}");
    assert_eq!(dash["conteos"]["misiones"], 1);
    assert_eq!(dash["conteos"]["objetos"], 1);
    assert_eq!(dash["semana"].as_array().unwrap().len(), 7);
    assert!(
        dash["semana"][6]["distancia_km"].as_f64().unwrap() > 0.2,
        "hoy cuenta la misión"
    );
    assert!(dash["recientes"]["objetos"][0].get("embedding").is_none());
    let (s, _) = api.get(&yo, "/v1/dashboard?zona=Marte/Olympus").await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    ok("dashboard: conteos, recientes, alertas y semana (zona inválida → 422)");

    // Peligros cerca de una ruta: POI crítico (15) + persona hostil (10) + ruta peligrosa (5) = 30
    let ahora = chrono::Utc::now();
    let meta =
        json!({ "capturado_en": ahora, "creado_en": ahora, "actualizado_en": ahora, "version": 1 });
    let con_meta = |mut v: Value| {
        v.as_object_mut()
            .unwrap()
            .extend(meta.as_object().unwrap().clone());
        v
    };
    // Fotos en Storage: una de la persona hostil (se compartirá) y una privada
    let auth = var("KEPLER_E2E_AUTH");
    let anon = var("KEPLER_E2E_ANON");
    let yo_id = perfil["id"].as_str().unwrap().to_owned();
    let foto_hostil = format!("{yo_id}/persona/{}.jpg", kepler_core::nuevo_id());
    let foto_privada = format!("{yo_id}/objeto/{}.jpg", kepler_core::nuevo_id());
    for foto in [&foto_hostil, &foto_privada] {
        let r = http
            .post(format!("{auth}/storage/v1/object/capturas/{foto}"))
            .header("apikey", &anon)
            .bearer_auth(&yo.token)
            .header("content-type", "image/jpeg")
            .body(vec![0xffu8, 0xd8, 0xff, 0xe0])
            .send()
            .await
            .unwrap();
        assert!(r.status().is_success(), "subida {foto}: {}", r.status());
    }

    let poi_id = kepler_core::nuevo_id();
    let hostil_id = kepler_core::nuevo_id();
    let poi = con_meta(
        json!({ "id": poi_id, "nombre": "Derrumbe", "nivel_riesgo": "critico",
                "lat": 10.5005, "lng": -66.8000, "metadata": {} }),
    );
    let hostil = con_meta(
        json!({ "id": hostil_id, "nombre": "Vigía", "hostilidad": "hostil",
                "rasgos_fisicos": "Chaqueta roja, barba", "imagen_path": foto_hostil,
                "lat": 10.5000, "lng": -66.7995 }),
    );
    let mut ruta = con_meta(
        json!({ "id": kepler_core::nuevo_id(), "nombre": "Paso del cóndor", "origen": "registrada",
                                    "seguridad": "peligro", "waypoints": [[10.499, -66.801], [10.501, -66.799]] }),
    );
    ruta.as_object_mut().unwrap().remove("capturado_en");
    let (_, r) = api
        .post(
            &yo,
            "/v1/sync/subir",
            json!({ "puntos_interes": [poi], "personas": [hostil], "rutas": [ruta] }),
        )
        .await;
    assert!(r["rechazados"].as_array().unwrap().is_empty(), "{r}");
    let poi_servidor = r["aplicados"]["puntos_interes"][0].clone();
    assert_eq!(
        poi_servidor["visibilidad"], "compartido",
        "POIs compartidos por defecto"
    );

    // Aviso en vivo: lo recibe el otro explorador, no el autor
    let mut avisos = Vec::new();
    for _ in 0..2 {
        if let Some(Contenido::Reporte(rep)) = recibir(&mut ajeno).await.and_then(|e| e.contenido) {
            assert_eq!(rep.autor, u1);
            avisos.push(rep.nivel);
        }
    }
    avisos.sort();
    assert_eq!(avisos, ["critico", "hostil"]);
    assert!(
        nada_en(&mut cc, 300).await,
        "el autor no recibe su propio aviso"
    );
    ok("aviso en vivo de peligro nuevo al otro explorador (POI crítico + persona hostil)");

    let trazado = json!({ "waypoints": [[10.49, -66.80], [10.51, -66.80]], "corredor_m": 200 });
    let (s, a) = api.post(&yo, "/v1/rutas/analizar", trazado.clone()).await;
    assert_eq!(s, StatusCode::OK, "{a}");
    assert_eq!(a["puntos_interes"].as_array().unwrap().len(), 1);
    assert_eq!(a["personas"].as_array().unwrap().len(), 1);
    assert_eq!(
        a["rutas"].as_array().unwrap().len(),
        1,
        "trazado PostGIS generado desde waypoints"
    );
    assert_eq!(
        (
            a["riesgo"]["nivel"].as_str(),
            a["riesgo"]["puntuacion"].as_u64()
        ),
        (Some("critico"), Some(30))
    );
    assert!((a["distancia_km"].as_f64().unwrap() - 2.21).abs() < 0.05);
    ok(&format!(
        "análisis de ruta propio ({} km): riesgo crítico 30",
        a["distancia_km"]
    ));

    // El otro explorador ve el POI y la alerta, pero no la ruta (privada)
    let (_, a_otro) = api.post(&otro, "/v1/rutas/analizar", trazado.clone()).await;
    assert_eq!(a_otro["puntos_interes"][0]["propio"], false);
    assert_eq!(a_otro["puntos_interes"][0]["autor"], u1);
    assert_eq!(a_otro["puntos_interes"][0]["vigencia"], "vigente");
    let alerta = &a_otro["personas"][0];
    assert_eq!(alerta["nombre"], "Persona hostil", "sin el nombre real");
    assert_eq!(alerta["descripcion"], "Chaqueta roja, barba");
    assert_eq!(alerta["imagen_path"], json!(foto_hostil));
    assert!(
        a_otro["rutas"].as_array().unwrap().is_empty(),
        "las rutas son privadas"
    );
    assert_eq!(
        (
            a_otro["riesgo"]["nivel"].as_str(),
            a_otro["riesgo"]["puntuacion"].as_u64()
        ),
        (Some("alto"), Some(25))
    );
    ok("el otro explorador ve POI y alerta (con autor, descripción y foto), no la ruta: riesgo 25");

    // Fotos: la de la alerta se comparte, la privada no
    let ver = |foto: String| {
        http.get(format!(
            "{auth}/storage/v1/object/authenticated/capturas/{foto}"
        ))
        .header("apikey", anon.clone())
        .bearer_auth(otro.token.clone())
        .send()
    };
    assert_eq!(
        ver(foto_hostil.clone()).await.unwrap().status(),
        StatusCode::OK
    );
    assert_ne!(
        ver(foto_privada.clone()).await.unwrap().status(),
        StatusCode::OK
    );
    ok("foto de la alerta visible para el otro; foto privada no");

    // Solo el autor edita lo compartido
    let mut pisado = poi_servidor.clone();
    pisado["nombre"] = json!("Despejado");
    pisado["version"] = json!(poi_servidor["version"].as_i64().unwrap() + 1);
    let (_, r) = api
        .post(
            &otro,
            "/v1/sync/subir",
            json!({ "puntos_interes": [pisado] }),
        )
        .await;
    assert!(
        r["rechazados"][0]["motivo"]
            .as_str()
            .unwrap()
            .contains("otro explorador"),
        "{r}"
    );
    ok("el otro explorador no puede editar el POI compartido");

    // Lo que baja el otro al sincronizar
    let (_, c_otro) = api.get(&otro, "/v1/sync/cambios").await;
    assert!(
        c_otro["tablas"]["puntos_interes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == json!(poi_id))
    );
    assert!(c_otro["tablas"]["rutas"].as_array().unwrap().is_empty());
    assert!(
        c_otro["tablas"]["objetos"].as_array().unwrap().is_empty(),
        "objetos privados por defecto"
    );
    let alertas = c_otro["alertas_personas"].as_array().unwrap();
    assert_eq!(alertas.len(), 1);
    assert!(alertas[0].get("nombre").is_none() && alertas[0].get("embedding").is_none());
    assert!(
        c_otro["exploradores"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["nombre_usuario"] == u1)
    );
    let (_, d_otro) = api.get(&otro, "/v1/dashboard").await;
    assert_eq!(d_otro["conteos"]["reportes_compartidos"], 2);
    assert_eq!(
        d_otro["conteos"]["puntos_interes"], 0,
        "el dashboard cuenta solo lo propio"
    );
    ok("sync del otro: POI compartido y alerta sin nombre; sin rutas ni objetos privados");

    let (_, c) = api
        .get(&yo, "/v1/alertas/cercanas?lat=10.5&lng=-66.8&radio_m=300")
        .await;
    assert_eq!(c["puntos_interes"][0]["nombre"], "Derrumbe");
    assert!(
        c["objetos"].as_array().unwrap().is_empty(),
        "las alertas solo incluyen peligros"
    );
    ok(&format!(
        "alertas cercanas: {} peligros (nivel {})",
        c["puntos_interes"].as_array().unwrap().len()
            + c["personas"].as_array().unwrap().len()
            + c["rutas"].as_array().unwrap().len(),
        c["riesgo"]["nivel"]
    ));

    // Confirmaciones del otro explorador
    let confirmacion = |entidad: &str, registro, tipo: &str| {
        json!({ "id": kepler_core::nuevo_id(), "entidad": entidad, "registro_id": registro,
                "tipo": tipo, "creado_en": chrono::Utc::now() })
    };
    let (_, r) = api
        .post(
            &otro,
            "/v1/sync/subir",
            json!({ "confirmaciones": [
            confirmacion("poi", poi_id, "vigente"),
            confirmacion("persona", hostil_id, "no_vigente"),
            confirmacion("poi", objeto_id, "vigente"), // objeto privado: no se puede
        ] }),
        )
        .await;
    assert_eq!(
        r["aplicados"]["confirmaciones"].as_array().unwrap().len(),
        2,
        "{r}"
    );
    assert_eq!(r["rechazados"].as_array().unwrap().len(), 1, "{r}");
    let (_, a) = api.post(&yo, "/v1/rutas/analizar", trazado).await;
    assert_eq!(a["personas"][0]["vigencia"], "retirado");
    assert_eq!(
        (
            a["riesgo"]["nivel"].as_str(),
            a["riesgo"]["puntuacion"].as_u64()
        ),
        (Some("alto"), Some(20))
    );
    let (_, c) = api
        .get(&yo, "/v1/alertas/cercanas?lat=10.5&lng=-66.8&radio_m=300")
        .await;
    assert!(
        c["personas"].as_array().unwrap().is_empty(),
        "lo retirado no aparece en alertas"
    );
    ok("confirmaciones: POI confirmado, persona retirada (riesgo 30 → 20), privado rechazado");

    // ===== Paso 5: visión en el servidor =====
    let salud: Value = http
        .get(format!("{}/health", api.base))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(salud["vision"]["ok"], true, "{salud}");
    let foto = std::fs::read(format!("{}/prueba-bus.jpg", var("KEPLER_E2E_MODELOS"))).unwrap();

    // Detección en vivo: Fotograma → YOLO + ByteTrack → Detecciones
    let mut e_vision = Emisor::default();
    let (mut vision, _) = conectar_ws_con(&yo, TipoCliente::UnidadCampo, &mut e_vision, true).await;
    let mut tracks = Vec::new();
    for numero in 1..=2 {
        enviar(
            &mut vision,
            &mut e_vision,
            Fotograma {
                numero,
                jpeg: foto.clone(),
                ancho: 810,
                alto: 1080,
            },
        )
        .await;
        let Some(Contenido::Detecciones(d)) = recibir(&mut vision).await.and_then(|e| e.contenido)
        else {
            panic!("sin detecciones")
        };
        assert_eq!(d.origen(), OrigenDeteccion::Servidor);
        assert_eq!(d.fotograma, numero);
        let personas = d.items.iter().filter(|i| i.clase == "person").count();
        assert!(
            personas >= 4 && d.items.iter().any(|i| i.clase == "bus"),
            "{:?}",
            d.items
        );
        let mut ids: Vec<u32> = d.items.iter().filter_map(|i| i.track_id).collect();
        ids.sort();
        tracks.push(ids);
        if numero == 1 {
            ok(&format!(
                "detección en el servidor: {} objetos ({personas} personas + bus) en {:.0} ms",
                d.items.len(),
                d.latencia_ms
            ));
        }
    }
    assert_eq!(tracks[0], tracks[1], "ByteTrack mantiene los ids");
    ok(&format!(
        "ByteTrack: mismos track_id en dos fotogramas {:?}",
        tracks[0]
    ));
    let mut vistos = (false, false);
    while let Some(e) = tokio::time::timeout(Duration::from_millis(500), recibir(&mut cc))
        .await
        .ok()
        .flatten()
    {
        match e.contenido {
            Some(Contenido::Fotograma(_)) => vistos.0 = true,
            Some(Contenido::Detecciones(d)) if d.origen() == OrigenDeteccion::Servidor => {
                vistos.1 = true
            }
            _ => {}
        }
    }
    assert_eq!(
        vistos,
        (true, true),
        "el centro de control recibe fotograma y detecciones"
    );
    ok("el centro de control recibe el fotograma y las detecciones del servidor");

    // Capturas: foto a Storage + CLIP + Re-ID
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&foto);
    let captura = |entidad: &str, extra: Value| {
        let ahora = chrono::Utc::now();
        let mut fila = json!({ "id": kepler_core::nuevo_id(), "capturado_en": ahora, "creado_en": ahora,
                               "actualizado_en": ahora, "version": 1, "lat": 10.481, "lng": -66.903 });
        fila.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        json!({ "entidad": entidad, "fila": fila, "imagen": b64 })
    };
    let (s, r) = api
        .post(
            &yo,
            "/v1/capturas",
            json!([
                captura("persona", json!({ "nombre": "Conductor" })),
                captura(
                    "objeto",
                    json!({ "nombre": "Autobús", "clase_yolo": "bus", "confianza": 0.93 })
                ),
                captura(
                    "poi",
                    json!({ "nombre": "Parada", "nivel_riesgo": "bajo", "metadata": {} })
                ),
            ]),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{r}");
    assert_eq!(r["vision"], true);
    let procesadas = r["procesadas"].as_array().unwrap();
    assert_eq!(procesadas.len(), 3, "{}", r["rechazadas"]);
    assert!(
        procesadas
            .iter()
            .all(|p| p["accion"] == "creada" && p["imagen_path"].is_string())
    );
    assert!(
        procesadas
            .iter()
            .all(|p| p["fila"].get("embedding").is_none())
    );
    let persona_1 = procesadas[0]["id"].clone();
    let poi_1 = procesadas[2]["id"].clone();
    let mut fotos_capturas: Vec<String> = procesadas
        .iter()
        .map(|p| p["imagen_path"].as_str().unwrap().to_owned())
        .collect();
    let foto_guardada = http
        .get(format!(
            "{auth}/storage/v1/object/authenticated/capturas/{}",
            fotos_capturas[0]
        ))
        .header("apikey", &anon)
        .bearer_auth(&yo.token)
        .send()
        .await
        .unwrap();
    assert_eq!(foto_guardada.bytes().await.unwrap().len(), foto.len());
    ok("capturas: persona, objeto y POI guardados con foto en Storage y embedding");

    let (_, r) = api
        .post(
            &yo,
            "/v1/capturas",
            json!([captura("persona", json!({ "nombre": "Persona 20:41" }))]),
        )
        .await;
    let p = &r["procesadas"][0];
    assert_eq!(p["reid"]["id"], persona_1, "{r}");
    assert!(p["reid"]["similitud"].as_f64().unwrap() > 0.99);
    assert_eq!(p["fila"]["identidad_id"], persona_1);
    assert_eq!(p["fila"]["nombre"], "Conductor");
    fotos_capturas.push(p["imagen_path"].as_str().unwrap().to_owned());
    ok(&format!(
        "Re-ID de persona: vinculada a \"Conductor\" (similitud {:.3})",
        p["reid"]["similitud"].as_f64().unwrap()
    ));

    let (_, r) = api
        .post(
            &otro,
            "/v1/capturas",
            json!([captura(
                "poi",
                json!({ "nombre": "Parada de bus", "metadata": {} })
            )]),
        )
        .await;
    let p = &r["procesadas"][0];
    assert_eq!(p["accion"], "duplicado", "{r}");
    assert_eq!(p["reid"]["id"], poi_1);
    assert!(p["imagen_path"].is_null(), "un duplicado no guarda foto");
    let (_, c) = api.get(&otro, "/v1/sync/cambios").await;
    assert!(
        c["tablas"]["confirmaciones"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x["registro_id"] == poi_1 && x["tipo"] == "vigente")
    );
    ok("Re-ID de POI entre exploradores: duplicado detectado y cuenta como confirmación");

    let (_, r) = api.post(&yo, "/v1/capturas", json!([
        { "entidad": "objeto", "fila": { "id": kepler_core::nuevo_id(), "nombre": "x" }, "imagen": "no-es-base64!" }
    ])).await;
    assert_eq!(r["rechazadas"].as_array().unwrap().len(), 1, "{r}");
    ok("captura con datos inválidos: rechazada sin tumbar el lote");
    vaciar(&mut cc).await;

    // Mapas offline con Range (lo que usa MapLibre)
    let (_, mapas) = api.get(&yo, "/v1/mapas").await;
    if let Some(region) = mapas.as_array().and_then(|m| m.first()) {
        let url = format!("{}{}", api.base, region["url"].as_str().unwrap());
        let r = http
            .get(&url)
            .bearer_auth(&yo.token)
            .header("range", "bytes=0-6")
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(&r.bytes().await.unwrap()[..], b"PMTiles");
        let sin_sesion = http
            .get(&url)
            .header("range", "bytes=0-6")
            .send()
            .await
            .unwrap();
        assert_eq!(sin_sesion.status(), StatusCode::UNAUTHORIZED);
        ok(&format!(
            "mapa {} ({} MB): Range 206 con cabecera PMTiles; sin sesión 401",
            region["id"], region["tamano_mb"]
        ));
    } else {
        println!("  ⚠️  sin mapas en el servidor, se omite la prueba de PMTiles");
    }

    // --- protocolo: texto no permitido
    cc.send(Message::Text("hola".into())).await.unwrap();
    assert!(matches!(
        recibir(&mut cc).await.unwrap().contenido,
        Some(Contenido::Error(_))
    ));
    ok("mensaje de texto en WebSocket → Error");

    // --- bitácora
    let mensajes = |v: &Value| -> Vec<String> {
        v["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n["mensaje"].as_str().unwrap().to_owned())
            .collect()
    };
    let (s, b) = api.get(&yo, "/v1/notificaciones?limite=200").await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let propias = mensajes(&b);
    for esperado in ["iniciada", "completada", "Re-ID: persona vinculada"] {
        assert!(
            propias.iter().any(|m| m.contains(esperado)),
            "falta «{esperado}» en {propias:?}"
        );
    }
    assert!(
        !propias.iter().any(|m| m.contains("reportó")),
        "no se avisa a uno mismo"
    );
    let (_, b) = api.get(&otro, "/v1/notificaciones").await;
    assert!(
        mensajes(&b)
            .iter()
            .any(|m| m.contains("cuenta como confirmación")),
        "POI duplicado de otro explorador"
    );
    let (_, b) = api
        .get(
            &otro,
            "/v1/notificaciones?tipo=critical&solo_no_leidas=true",
        )
        .await;
    let ajenas = mensajes(&b);
    assert!(
        ajenas
            .iter()
            .any(|m| m.contains("reportó un peligro: «Derrumbe» (riesgo crítico)")),
        "{ajenas:?}"
    );
    assert!(
        ajenas
            .iter()
            .any(|m| m.contains("persona hostil: Chaqueta roja")),
        "{ajenas:?}"
    );
    assert!(b["no_leidas"].as_i64().unwrap() >= 2);
    let (s, _) = api
        .post(
            &otro,
            "/v1/notificaciones/leer",
            json!({ "todas": true, "ids": [Uuid::now_v7()] }),
        )
        .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, r) = api
        .post(&otro, "/v1/notificaciones/leer", json!({ "todas": true }))
        .await;
    assert_eq!(r["no_leidas"], 0, "{r}");
    ok(&format!(
        "bitácora: {} entradas propias (misión, Re-ID), {} avisos de peligro al otro, marcar leídas",
        propias.len(),
        ajenas.len()
    ));

    for foto in [&foto_hostil, &foto_privada]
        .into_iter()
        .chain(&fotos_capturas)
    {
        http.delete(format!("{auth}/storage/v1/object/capturas/{foto}"))
            .header("apikey", &anon)
            .bearer_auth(&yo.token)
            .send()
            .await
            .unwrap();
    }

    println!("\nE2E completo.");
}

fn urlencode(s: &str) -> String {
    s.replace('+', "%2B").replace(':', "%3A")
}
