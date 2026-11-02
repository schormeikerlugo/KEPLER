//! Campo sin conexión contra un kepler-server real (se ignora por defecto):
//!
//! ```sh
//! KEPLER_PRUEBA_SERVIDOR=http://192.168.68.117:8000 KEPLER_PRUEBA_USUARIO=centro_demo \
//!   KEPLER_PRUEBA_CONTRASENA=… cargo test -p kepler-movil --test sin_conexion -- --ignored
//! ```
//!
//! Un núcleo sin red (servidor inalcanzable) inicia una misión, registra el
//! rastro, guarda una captura y cierra la misión; otro núcleo con red, sobre el
//! mismo almacén, lo sincroniza todo.

use std::sync::Arc;

use kepler_movil::{Llavero, Nucleo, NuevaCaptura, PuntoGps, TipoCaptura};

struct SinLlavero;

impl Llavero for SinLlavero {
    fn guardar_sesion(&self, _usuario: String, _refresh_token: String) {}
}

fn var(k: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| panic!("falta {k}"))
}

#[tokio::test]
#[ignore = "necesita un kepler-server y una cuenta de prueba"]
async fn mision_y_captura_sin_conexion_se_sincronizan() {
    let dir = std::env::temp_dir().join(format!("kepler-prueba-{}", std::process::id()));
    let usuario = var("KEPLER_PRUEBA_USUARIO");

    // --- sin red
    let sin_red = Nucleo::new(
        "http://127.0.0.1:9".into(),
        Arc::new(SinLlavero),
        dir.display().to_string(),
    );
    sin_red
        .entrar_sin_conexion(usuario.clone(), "token-falso".into())
        .unwrap();
    let m = sin_red
        .iniciar_mision("Prueba sin red".into(), Some(10.50), Some(-66.90))
        .unwrap();
    let t0 = chrono::Utc::now().timestamp() as f64 - 600.0;
    for i in 0..20 {
        let p = PuntoGps {
            lat: 10.50 + f64::from(i) * 0.0002,
            lng: -66.90,
            altitud: None,
            velocidad: Some(1.2),
            rumbo: None,
            precision_m: Some(5.0),
            en: t0 + f64::from(i) * 15.0,
        };
        sin_red.registrar_punto(p).unwrap();
    }
    let jpeg = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../models/onnx/prueba-bus.jpg"
    ))
    .unwrap();
    let c = sin_red
        .capturar(
            NuevaCaptura {
                tipo: TipoCaptura::Objeto,
                nombre: "Autobús".into(),
                clase: Some("bus".into()),
                confianza: Some(0.9),
                lat: Some(10.501),
                lng: Some(-66.9),
                mision_id: Some(m.id.clone()),
                nivel_riesgo: None,
                categoria_id: None,
                descripcion: None,
                compartir: false,
            },
            jpeg,
        )
        .await
        .unwrap();
    assert!(c.en_cola, "{c:?}");
    sin_red.terminar_mision(true).unwrap();
    let e = sin_red.sincronizar().await.unwrap();
    assert!(!e.en_linea);
    assert_eq!((e.pendientes, e.rastro), (3, 20), "{e:?}");

    // --- con red, mismo almacén
    let con_red = Nucleo::new(
        var("KEPLER_PRUEBA_SERVIDOR"),
        Arc::new(SinLlavero),
        dir.display().to_string(),
    );
    con_red
        .entrar(usuario, var("KEPLER_PRUEBA_CONTRASENA"))
        .await
        .unwrap();
    let e = con_red.sincronizar().await.unwrap();
    assert_eq!(
        (e.pendientes, e.rastro, e.apartadas, e.en_linea),
        (0, 0, 0, true),
        "{e:?}"
    );
    // Reenviar no rompe nada
    assert_eq!(con_red.sincronizar().await.unwrap().pendientes, 0);
    let p = con_red.panel(None, None).await.unwrap();
    let fila = p
        .misiones
        .iter()
        .find(|f| f.id == m.id)
        .expect("la misión llegó");
    assert_eq!(fila.estado, "completada");
    let _ = std::fs::remove_dir_all(dir);
}
