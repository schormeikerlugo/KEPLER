//! Revisión en la base contra un kepler-server real (se ignora por defecto;
//! mismas variables que `sin_conexion.rs`): archivos y edición, comparador,
//! bitácora y Cortex en streaming.

use std::sync::{Arc, Mutex};

use kepler_movil::{EdicionHallazgo, Llavero, Nucleo, OyenteCortex, TipoHallazgo};

struct SinLlavero;

impl Llavero for SinLlavero {
    fn guardar_sesion(&self, _usuario: String, _refresh_token: String) {}
}

#[derive(Default)]
struct Oyente {
    estados: Mutex<Vec<String>>,
    ultimo: Mutex<String>,
}

impl OyenteCortex for Oyente {
    fn estado(&self, texto: String) {
        self.estados.lock().unwrap().push(texto);
    }
    fn texto(&self, acumulado: String) {
        *self.ultimo.lock().unwrap() = acumulado;
    }
    fn imagenes(&self, _todas: Vec<kepler_movil::ImagenCortex>) {}
}

fn var(k: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| panic!("falta {k}"))
}

#[tokio::test]
#[ignore = "necesita un kepler-server y una cuenta de prueba con datos"]
async fn archivos_bitacora_y_cortex() {
    let dir = std::env::temp_dir().join(format!("kepler-base-{}", std::process::id()));
    let n = Nucleo::new(
        var("KEPLER_PRUEBA_SERVIDOR"),
        Arc::new(SinLlavero),
        dir.display().to_string(),
    );
    n.entrar(
        var("KEPLER_PRUEBA_USUARIO"),
        var("KEPLER_PRUEBA_CONTRASENA"),
    )
    .await
    .unwrap();

    // Archivos: listar, buscar, editar y comprobar
    let p = n
        .archivos(TipoHallazgo::PuntosInteres, None, None, None)
        .await
        .unwrap();
    assert!(!p.items.is_empty());
    let poi = &p.items[0];
    let editado = n
        .editar_hallazgo(EdicionHallazgo {
            tipo: TipoHallazgo::PuntosInteres,
            id: poi.id.clone(),
            nombre: format!("{} (revisado)", poi.nombre),
            texto: "Revisado desde el iPhone".into(),
            notas: String::new(),
            nivel: "alto".into(),
            compartido: poi.compartido,
        })
        .await
        .unwrap();
    assert_eq!(
        (editado.nivel.as_str(), editado.texto.as_str()),
        ("alto", "Revisado desde el iPhone")
    );
    let b = n
        .archivos(
            TipoHallazgo::PuntosInteres,
            Some("revisado".into()),
            None,
            None,
        )
        .await
        .unwrap();
    assert_eq!(b.items.len(), 1);

    // Comparador y bitácora
    n.identidades_pendientes().await.unwrap();
    let bit = n.bitacora(None, false).await.unwrap();
    assert!(!bit.items.is_empty());
    n.marcar_leidas(vec![]).await.unwrap();
    assert_eq!(n.no_leidas().await.unwrap(), 0);

    // Cortex en streaming
    let o = Arc::new(Oyente::default());
    let fin = n
        .cortex_enviar(
            None,
            "¿Cuántas misiones tengo?".into(),
            Some(10.5),
            Some(-66.9),
            Some(-240),
            o.clone(),
        )
        .await
        .unwrap();
    assert!(!fin.texto.is_empty() && fin.chat_id.is_some(), "{fin:?}");
    assert_eq!(*o.ultimo.lock().unwrap(), fin.texto);
    assert!(!o.estados.lock().unwrap().is_empty());
    let chats = n.cortex_chats().await.unwrap();
    assert_eq!(n.cortex_chat(chats[0].id.clone()).await.unwrap().len(), 2);
    n.cortex_borrar(chats[0].id.clone()).await.unwrap();
    println!("Cortex ({:.1} s): {}", fin.segundos, fin.texto);
    let _ = std::fs::remove_dir_all(dir);
}
