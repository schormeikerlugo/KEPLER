mod capturas;
mod catalogos;
mod dashboard;
mod en_vivo;
mod entorno;
mod explorador;
mod mapas;
mod misiones;
mod notificaciones;
mod perfil;
mod rutas;
mod salud;
mod sesion;
mod sync;

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::{FromRequestParts, Request, State};
use axum::http::{HeaderValue, Method, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use tower_governor::GovernorLayer;
use tower_governor::governor::GovernorConfigBuilder;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use crate::auth::Sesion;
use crate::estado::Estado;

/// Tamaño máximo de un cuerpo REST (lotes de sincronización).
const LIMITE_CUERPO: usize = 16 * 1024 * 1024;

pub fn router(estado: Estado) -> Router {
    let intervalo_ms = (1000 / estado.config.peticiones_por_segundo.max(1)).max(1);
    let limite = GovernorConfigBuilder::default()
        .per_millisecond(intervalo_ms)
        .burst_size(estado.config.rafaga)
        .finish()
        .expect("configuración de rate limit");

    let rest = Router::new()
        .route("/sesion", post(sesion::entrar))
        .route("/sesion/renovar", post(sesion::renovar))
        .route("/sesion/cerrar", post(sesion::cerrar))
        .route("/yo", get(perfil::obtener).patch(perfil::actualizar))
        .route("/catalogos", get(catalogos::listar))
        .route("/misiones", get(misiones::listar).post(misiones::crear))
        .route("/misiones/{id}", get(misiones::obtener))
        .route("/misiones/{id}/iniciar", post(misiones::iniciar))
        .route("/misiones/{id}/completar", post(misiones::completar))
        .route("/misiones/{id}/abortar", post(misiones::abortar))
        .route(
            "/misiones/{id}/rastro",
            get(misiones::rastro).post(misiones::agregar_rastro),
        )
        .route("/sync/cambios", get(sync::cambios))
        .route("/sync/subir", post(sync::subir))
        .route("/notificaciones", get(notificaciones::listar))
        .route("/notificaciones/leer", post(notificaciones::leer))
        .route("/dashboard", get(dashboard::resumen))
        .route("/explorador", get(explorador::estado))
        .route("/explorador/calzado", post(explorador::reset_calzado))
        .route("/clima", get(entorno::clima))
        .route("/aire", get(entorno::aire))
        .route("/geo/ip", get(entorno::ubicacion_ip))
        .route("/rutas/analizar", post(rutas::analizar))
        .route("/alertas/cercanas", get(rutas::cercanas))
        .route("/mapas", get(mapas::listar))
        .route("/capturas", post(capturas::procesar))
        .layer(GovernorLayer::new(Arc::new(limite)))
        .layer(RequestBodyLimitLayer::new(LIMITE_CUERPO));

    // Archivos PMTiles con soporte de Range: con sesión pero sin rate limit
    // (MapLibre pide muchos fragmentos al mover el mapa).
    let archivos_mapas = Router::new()
        .nest_service("/mapas/archivos", ServeDir::new(&estado.config.mapas_dir))
        .layer(middleware::from_fn_with_state(
            estado.clone(),
            exigir_sesion,
        ));

    let v1 = rest
        .route("/en-vivo", get(en_vivo::conectar))
        .merge(archivos_mapas);

    let mut app = Router::new()
        .route("/health", get(salud::salud))
        .nest("/v1", v1)
        .layer(TraceLayer::new_for_http());

    if !estado.config.cors_origenes.is_empty() {
        let origenes: Vec<HeaderValue> = estado
            .config
            .cors_origenes
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        app = app.layer(
            CorsLayer::new()
                .allow_origin(origenes)
                .allow_methods([Method::GET, Method::POST, Method::PATCH])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
                .max_age(Duration::from_secs(3600)),
        );
    }

    app.with_state(estado)
}

async fn exigir_sesion(State(estado): State<Estado>, req: Request, next: Next) -> Response {
    let (mut partes, cuerpo) = req.into_parts();
    match Sesion::from_request_parts(&mut partes, &estado).await {
        Ok(_) => next.run(Request::from_parts(partes, cuerpo)).await,
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use axum::body::Body;
    use axum::extract::ConnectInfo;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::router;
    use crate::auth::tests::{SECRETO, claims_validos, token};
    use crate::config::Config;
    use crate::db::Db;
    use crate::estado::Estado;

    fn app() -> axum::Router {
        let config = Config {
            direccion: "127.0.0.1:0".parse().unwrap(),
            database_url: String::new(),
            jwt_secret: SECRETO.into(),
            ollama_urls: vec![],
            ollama_modelo: "mistral:7b".into(),
            cors_origenes: vec![],
            peticiones_por_segundo: 1000,
            rafaga: 1000,
            mapas_dir: std::env::temp_dir(),
            zona_horaria: "America/Caracas".into(),
            modelos_dir: std::env::temp_dir(),
            vision_hilos: 1,
            storage_url: String::new(),
            anon_key: String::new(),
            auth_url: String::new(),
        };
        router(Estado::new(
            config,
            Db::sin_conexion(),
            Err("sin modelos en tests".into()),
        ))
    }

    async fn pedir(
        metodo: &str,
        uri: &str,
        token: Option<&str>,
        cuerpo: &str,
    ) -> (StatusCode, String) {
        let mut req = Request::builder()
            .method(metodo)
            .uri(uri)
            .header("content-type", "application/json");
        if let Some(t) = token {
            req = req.header("authorization", format!("Bearer {t}"));
        }
        let mut req = req.body(Body::from(cuerpo.to_owned())).unwrap();
        req.extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 9))));
        let resp = app().oneshot(req).await.unwrap();
        let estado = resp.status();
        let texto = String::from_utf8(
            resp.into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        (estado, texto)
    }

    #[tokio::test]
    async fn sin_token_o_token_falso_es_401() {
        let (s, cuerpo) = pedir("GET", "/v1/yo", None, "").await;
        assert_eq!(s, StatusCode::UNAUTHORIZED);
        assert!(cuerpo.contains("no_autorizado"));

        let falso = token(
            claims_validos(Uuid::now_v7()),
            "otro-secreto-cualquiera-de-32-chars!!",
        );
        assert_eq!(
            pedir("GET", "/v1/misiones", Some(&falso), "").await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            pedir("GET", "/v1/en-vivo", None, "").await.0,
            StatusCode::UNAUTHORIZED
        );
        for ruta in [
            "/v1/mapas/archivos/x.pmtiles",
            "/v1/clima?lat=1&lng=1",
            "/v1/dashboard",
        ] {
            assert_eq!(
                pedir("GET", ruta, None, "").await.0,
                StatusCode::UNAUTHORIZED,
                "{ruta}"
            );
        }
    }

    #[tokio::test]
    async fn validaciones_antes_de_tocar_la_base() {
        let t = token(claims_validos(Uuid::now_v7()), SECRETO);

        let (s, cuerpo) = pedir("POST", "/v1/sync/subir", Some(&t), r#"{"perfiles": []}"#).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert!(cuerpo.contains("no sincronizable"));

        let punto = format!(
            r#"{{"id":"{}","lat":10.0,"lng":-66.0,"registrado_en":"2026-10-31T20:00:00Z"}}"#,
            Uuid::now_v7()
        );
        let (s, _) = pedir("GET", "/v1/clima?lat=95&lng=0", Some(&t), "").await;
        assert_eq!(
            s,
            StatusCode::UNPROCESSABLE_ENTITY,
            "latitud fuera de rango"
        );

        let un_punto = r#"{"waypoints": [[10.0, -66.0]]}"#;
        let (s, _) = pedir("POST", "/v1/rutas/analizar", Some(&t), un_punto).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        let radio = "/v1/alertas/cercanas?lat=10&lng=-66&radio_m=999999";
        assert_eq!(
            pedir("GET", radio, Some(&t), "").await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let lote = format!("[{}]", vec![punto; 1001].join(","));
        let uri = format!("/v1/misiones/{}/rastro", Uuid::now_v7());
        assert_eq!(
            pedir("POST", &uri, Some(&t), &lote).await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[tokio::test]
    async fn ruta_desconocida_es_404() {
        assert_eq!(
            pedir("GET", "/v1/nada", None, "").await.0,
            StatusCode::NOT_FOUND
        );
    }
}
