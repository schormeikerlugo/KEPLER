//! Prueba de punta a punta contra un stack desplegado (no corre en `cargo test`).
//!
//! Requiere dos cuentas creadas con `create-user.sh` y estas variables:
//!   KEPLER_E2E_API=http://192.168.68.117:8000
//!   KEPLER_E2E_AUTH=http://192.168.68.117:54321
//!   KEPLER_E2E_ANON=<ANON_KEY>
//!   KEPLER_E2E_USUARIOS=e2e_uno,e2e_dos
//!   KEPLER_E2E_PASSWORD=<contraseña de ambas>
//!
//!   cargo test -p kepler-server --test e2e -- --ignored --nocapture

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use kepler_core::NombreUsuario;
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
}

async fn login(http: &Client, usuario: &str) -> Cuenta {
    let email = NombreUsuario::desde_entrada(usuario)
        .unwrap()
        .email_interno();
    let r: Value = http
        .post(format!(
            "{}/auth/v1/token?grant_type=password",
            var("KEPLER_E2E_AUTH")
        ))
        .header("apikey", var("KEPLER_E2E_ANON"))
        .json(&json!({ "email": email, "password": var("KEPLER_E2E_PASSWORD") }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    Cuenta {
        token: r["access_token"].as_str().expect("login").to_owned(),
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

    // --- protocolo: texto no permitido
    cc.send(Message::Text("hola".into())).await.unwrap();
    assert!(matches!(
        recibir(&mut cc).await.unwrap().contenido,
        Some(Contenido::Error(_))
    ));
    ok("mensaje de texto en WebSocket → Error");

    println!("\nE2E completo.");
}

fn urlencode(s: &str) -> String {
    s.replace('+', "%2B").replace(':', "%3A")
}
