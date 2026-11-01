//! Lógica del Centro de Control: login, carga del dashboard, estado del enlace y
//! cierre por inactividad. Las peticiones corren en tokio y el resultado se
//! aplica a la UI en el hilo de Slint.

use std::cell::Cell;
use std::rc::Rc;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{Datelike, Local};
use kepler_core::entorno::{CalidadAire, CategoriaClima};
use slint::winit_030::{EventResult, WinitWindowAccessor, winit::event::WindowEvent};
use slint::{Color, ComponentHandle, Model, ModelRc, Timer, TimerMode, VecModel, Weak};
use tokio::runtime::Handle;
use tokio::sync::Mutex;

use crate::api::{Cliente, Error};
use crate::modelos::{Aire, Clima, Dashboard, Explorador, Perfil, UbicacionIp};
use crate::{AppWindow, Atencion, Conteo, DatoIndicador, DiaSemana, Estado, FilaMision, Pantalla};

/// Igual que el session guard de la v0.7.
const INACTIVIDAD: Duration = Duration::from_secs(15 * 60);
const CADA_DASHBOARD: Duration = Duration::from_secs(60);
const CADA_SALUD: Duration = Duration::from_secs(10);
/// Posición del indicador de enlace en la telemetría.
const FILA_ENLACE: usize = 7;

struct Contexto {
    cliente: Arc<Cliente>,
    rt: Handle,
    ui: Weak<AppWindow>,
    /// Sin GPS en el escritorio: ubicación aproximada por IP, una vez por sesión.
    ubicacion: Mutex<Option<UbicacionIp>>,
}

pub fn conectar(ui: &AppWindow, rt: Handle, cliente: Arc<Cliente>) {
    let ctx = Arc::new(Contexto {
        cliente,
        rt,
        ui: ui.as_weak(),
        ubicacion: Mutex::new(None),
    });
    let estado = ui.global::<Estado>();
    estado.set_servidor(ctx.cliente.base().into());

    let c = ctx.clone();
    estado.on_entrar(move |usuario, contrasena| {
        entrar(&c, usuario.to_string(), contrasena.to_string())
    });
    let c = ctx.clone();
    estado.on_salir(move || salir(&c, ""));
    let c = ctx.clone();
    estado.on_refrescar(move || refrescar(&c));

    vigilar_enlace(&ctx);
    refrescar_periodicamente(&ctx);
    vigilar_inactividad(ui, &ctx);
}

fn entrar(ctx: &Arc<Contexto>, usuario: String, contrasena: String) {
    if let Some(ui) = ctx.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_entrando(true);
        e.set_error_login("".into());
    }
    let c = ctx.clone();
    ctx.rt.spawn(async move {
        let r = c.cliente.entrar(&usuario, &contrasena).await;
        let ok = r.is_ok();
        c.ui.upgrade_in_event_loop(move |ui| {
            let e = ui.global::<Estado>();
            e.set_entrando(false);
            match r {
                Ok(usuario) => {
                    e.set_usuario(usuario.into());
                    e.set_error("".into());
                    e.set_pantalla(Pantalla::Dashboard);
                }
                Err(err) => e.set_error_login(capitalizar(&err.to_string()).into()),
            }
        })
        .ok();
        if ok {
            cargar(&c).await;
        }
    });
}

fn salir(ctx: &Arc<Contexto>, motivo: &'static str) {
    if let Some(ui) = ctx.ui.upgrade() {
        let e = ui.global::<Estado>();
        e.set_pantalla(Pantalla::Login);
        e.set_error_login(motivo.into());
    }
    let c = ctx.clone();
    ctx.rt.spawn(async move {
        c.cliente.salir().await;
        *c.ubicacion.lock().await = None;
    });
}

fn refrescar(ctx: &Arc<Contexto>) {
    let c = ctx.clone();
    ctx.rt.spawn(async move { cargar(&c).await });
}

fn refrescar_periodicamente(ctx: &Arc<Contexto>) {
    let c = ctx.clone();
    ctx.rt.spawn(async move {
        let mut intervalo = tokio::time::interval(CADA_DASHBOARD);
        intervalo.tick().await;
        loop {
            intervalo.tick().await;
            if c.cliente.hay_sesion().await {
                cargar(&c).await;
            }
        }
    });
}

fn vigilar_enlace(ctx: &Arc<Contexto>) {
    let c = ctx.clone();
    ctx.rt.spawn(async move {
        let mut intervalo = tokio::time::interval(CADA_SALUD);
        loop {
            intervalo.tick().await;
            let r = c.cliente.salud().await;
            c.ui.upgrade_in_event_loop(move |ui| {
                let e = ui.global::<Estado>();
                let (en_linea, texto, estado) = match r {
                    Ok((s, t)) => {
                        let ms = t.as_millis();
                        let estado = if s.estado != "ok" || ms > 500 { 1 } else { 0 };
                        (true, format!("{ms} ms"), estado)
                    }
                    Err(_) => (false, "—".to_owned(), 2),
                };
                e.set_en_linea(en_linea);
                e.set_enlace(texto.clone().into());
                let filas = e.get_indicadores();
                if filas.row_count() > FILA_ENLACE {
                    filas.set_row_data(FILA_ENLACE, indicador(&texto, "ENLACE", estado));
                }
            })
            .ok();
        }
    });
}

/// Cualquier entrada del usuario reinicia el contador; a los 15 min se cierra la sesión.
fn vigilar_inactividad(ui: &AppWindow, ctx: &Arc<Contexto>) {
    let ultima = Rc::new(Cell::new(Instant::now()));
    let u = ultima.clone();
    ui.window().on_winit_window_event(move |_, ev| {
        if matches!(
            ev,
            WindowEvent::CursorMoved { .. }
                | WindowEvent::MouseInput { .. }
                | WindowEvent::MouseWheel { .. }
                | WindowEvent::KeyboardInput { .. }
        ) {
            u.set(Instant::now());
        }
        EventResult::Propagate
    });

    let c = ctx.clone();
    let reloj = Timer::default();
    reloj.start(TimerMode::Repeated, Duration::from_secs(15), move || {
        let Some(ui) = c.ui.upgrade() else { return };
        if ui.global::<Estado>().get_pantalla() == Pantalla::Dashboard
            && ultima.get().elapsed() > INACTIVIDAD
        {
            salir(&c, "Sesión cerrada tras 15 minutos de inactividad");
        }
    });
    // El temporizador vive lo que la app.
    std::mem::forget(reloj);
}

/// Pide todo lo del dashboard a la vez y lo aplica a la UI.
async fn cargar(c: &Arc<Contexto>) {
    c.ui.upgrade_in_event_loop(|ui| ui.global::<Estado>().set_cargando(true))
        .ok();

    let ubicacion = {
        let mut guardada = c.ubicacion.lock().await;
        if guardada.is_none() {
            *guardada = c
                .cliente
                .get::<crate::modelos::Disponible<UbicacionIp>>("/v1/geo/ip")
                .await
                .ok()
                .and_then(|d| d.datos().ok());
        }
        guardada.clone()
    };
    let posicion = ubicacion
        .as_ref()
        .map(|u| format!("lat={}&lng={}", u.lat, u.lng));
    let ruta_explorador = match &posicion {
        Some(p) => format!("/v1/explorador?{p}"),
        None => "/v1/explorador".into(),
    };
    let aire = async {
        match &posicion {
            Some(p) => c
                .cliente
                .get::<crate::modelos::Disponible<Aire>>(&format!("/v1/aire?{p}"))
                .await
                .ok()
                .and_then(|d| d.datos().ok()),
            None => None,
        }
    };

    let (perfil, dashboard, explorador, aire) = tokio::join!(
        c.cliente.get::<Perfil>("/v1/yo"),
        c.cliente.get::<Dashboard>("/v1/dashboard"),
        c.cliente.get::<Explorador>(&ruta_explorador),
        aire,
    );

    if let Some(Error::NoAutorizado(_)) = [perfil.as_ref().err(), dashboard.as_ref().err()]
        .into_iter()
        .flatten()
        .next()
    {
        let c2 = c.clone();
        c.ui.upgrade_in_event_loop(move |_| salir(&c2, "Sesión caducada: vuelve a entrar"))
            .ok();
        return;
    }

    let error = [
        perfil.as_ref().err(),
        dashboard.as_ref().err(),
        explorador.as_ref().err(),
    ]
    .into_iter()
    .flatten()
    .next()
    .map(ToString::to_string)
    .unwrap_or_default();

    let vista = Vista::construir(
        perfil.ok(),
        dashboard.ok(),
        explorador.ok(),
        aire,
        ubicacion,
    );
    c.ui.upgrade_in_event_loop(move |ui| {
        let e = ui.global::<Estado>();
        e.set_cargando(false);
        e.set_error(error.into());
        vista.aplicar(&e);
    })
    .ok();
}

/// Datos ya formateados para la UI (`Send`: se construyen fuera del hilo de Slint).
struct Vista {
    perfil: Option<(String, String, String)>,
    indicadores: Option<Vec<DatoIndicador>>,
    dashboard: Option<VistaDashboard>,
    explorador: Option<(f32, f32)>,
    clima: Option<(String, bool)>,
    ubicacion: String,
    actualizado: String,
}

struct VistaDashboard {
    atenciones: Vec<Atencion>,
    misiones: Vec<FilaMision>,
    conteos: Vec<Conteo>,
    semana: Vec<DiaSemana>,
    semana_total: String,
    semana_linea: String,
    semana_max: f32,
}

impl Vista {
    fn construir(
        perfil: Option<Perfil>,
        dashboard: Option<Dashboard>,
        explorador: Option<Explorador>,
        aire: Option<Aire>,
        ip: Option<UbicacionIp>,
    ) -> Self {
        let clima = explorador
            .as_ref()
            .and_then(|e| e.clima.clone())
            .and_then(|d| d.datos().ok());
        let ubicacion = clima
            .as_ref()
            .and_then(|c| c.ubicacion.clone())
            .or_else(|| ip.and_then(|i| i.ciudad))
            .unwrap_or_else(|| "Desconocida".into());
        Self {
            perfil: perfil.map(|p| {
                let usuario = p.nombre_usuario.unwrap_or_default();
                let visible = p
                    .nombre_visible
                    .filter(|n| !n.trim().is_empty())
                    .unwrap_or_else(|| usuario.clone());
                let rol = capitalizar(&p.rol);
                (visible, usuario, rol)
            }),
            indicadores: Some(telemetria(clima.as_ref(), aire.as_ref())),
            dashboard: dashboard.map(VistaDashboard::construir),
            explorador: explorador.map(|e| {
                (
                    (1.0 - e.desgaste_calzado / 100.0) as f32,
                    (e.resistencia / 100.0) as f32,
                )
            }),
            clima: clima.map(|c| (nombre_categoria(c.categoria).to_owned(), c.es_dia)),
            ubicacion,
            actualizado: format!("Actualizado {}", Local::now().format("%H:%M")),
        }
    }

    fn aplicar(self, e: &Estado<'_>) {
        if let Some((visible, usuario, rol)) = self.perfil {
            e.set_iniciales(iniciales(&visible).into());
            e.set_nombre_visible(visible.into());
            e.set_usuario(usuario.into());
            e.set_rol(rol.into());
        }
        if let Some(mut filas) = self.indicadores {
            // El enlace lo mide vigilar_enlace: se parte de su última medida.
            if e.get_en_linea() {
                filas[FILA_ENLACE] = indicador(&e.get_enlace(), "ENLACE", 0);
            }
            e.set_indicadores(modelo(filas));
        }
        if let Some(d) = self.dashboard {
            e.set_atenciones(modelo(d.atenciones));
            e.set_misiones(modelo(d.misiones));
            e.set_conteos(modelo(d.conteos));
            e.set_semana(modelo(d.semana));
            e.set_semana_total(d.semana_total.into());
            e.set_semana_linea(d.semana_linea.into());
            e.set_semana_max(d.semana_max);
        }
        if let Some((calzado, resistencia)) = self.explorador {
            e.set_calzado(calzado);
            e.set_resistencia(resistencia);
        }
        match self.clima {
            Some((texto, dia)) => {
                e.set_clima(texto.into());
                e.set_es_dia(dia);
            }
            None => e.set_clima("sin datos".into()),
        }
        e.set_ubicacion(self.ubicacion.into());
        e.set_actualizado(self.actualizado.into());
    }
}

impl VistaDashboard {
    fn construir(d: Dashboard) -> Self {
        let a = &d.alertas;
        let atenciones = [
            (
                a.pois_riesgo_alto,
                ("POI", "POIs"),
                "de riesgo alto o crítico",
                "⚑",
            ),
            (
                a.personas_hostiles,
                ("Persona", "Personas"),
                "con nivel hostil",
                "◉",
            ),
            (
                a.misiones_sin_reporte,
                ("Misión", "Misiones"),
                "sin documentar",
                "➤",
            ),
            (
                a.objetos_baja_confianza,
                ("Objeto", "Objetos"),
                "no reconocidos",
                "◈",
            ),
        ]
        .into_iter()
        .filter(|(n, ..)| *n > 0)
        .map(|(n, (uno, varios), texto, icono)| Atencion {
            cantidad: n as i32,
            resaltado: if n == 1 { uno } else { varios }.into(),
            texto: texto.into(),
            icono: icono.into(),
        })
        .collect();

        let misiones = d
            .recientes
            .misiones
            .iter()
            .map(|m| FilaMision {
                codigo: m.codigo.as_str().into(),
                titulo: m
                    .titulo
                    .clone()
                    .filter(|t| !t.is_empty())
                    .unwrap_or_else(|| m.codigo.clone())
                    .into(),
                estado: m.estado.as_str().into(),
                fecha: m
                    .creado_en
                    .with_timezone(&Local)
                    .format("%d/%m/%Y · %H:%M")
                    .to_string()
                    .into(),
            })
            .collect();

        let k = &d.conteos;
        let conteos = [
            (k.puntos_interes, "Puntos de interés", 0x3FA8FF),
            (k.personas, "Personas", 0xFFBB33),
            (k.objetos, "Objetos", 0x00D4AA),
            (k.rutas, "Rutas", 0x9BD66B),
            (k.misiones, "Misiones", 0xCCCCCC),
            (k.misiones_activas, "Misiones activas", 0x22C55E),
            (
                k.reportes_compartidos,
                "Reportes de otros exploradores",
                0xFF4444,
            ),
        ]
        .into_iter()
        .map(|(n, etiqueta, rgb)| Conteo {
            valor: n as i32,
            etiqueta: etiqueta.into(),
            color: Color::from_argb_encoded(0xff00_0000 | rgb),
        })
        .collect();

        const DIAS: [&str; 7] = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
        let km: Vec<f64> = d.semana.iter().map(|s| s.distancia_km).collect();
        let maximo = km.iter().copied().fold(0.0, f64::max).max(1.0);
        let semana = d
            .semana
            .iter()
            .map(|s| DiaSemana {
                etiqueta: DIAS[s.fecha.weekday().num_days_from_monday() as usize].into(),
                km: s.distancia_km as f32,
            })
            .collect();

        Self {
            atenciones,
            misiones,
            conteos,
            semana,
            semana_total: format!("{:.1}", km.iter().sum::<f64>()),
            semana_linea: trazado(&km, maximo),
            semana_max: maximo as f32,
        }
    }
}

/// Polilínea en un viewbox de 600×100 (y hacia abajo).
fn trazado(valores: &[f64], maximo: f64) -> String {
    if valores.len() < 2 {
        return String::new();
    }
    let paso = 600.0 / (valores.len() - 1) as f64;
    valores
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let orden = if i == 0 { "M" } else { "L" };
            format!(
                "{orden} {:.1} {:.1}",
                i as f64 * paso,
                100.0 - v / maximo * 100.0
            )
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Ocho indicadores reales: entorno (clima y aire en la ubicación) y enlace con el servidor.
fn telemetria(clima: Option<&Clima>, aire: Option<&Aire>) -> Vec<DatoIndicador> {
    let sin = |etiqueta| indicador("—", etiqueta, 3);
    let mut v = Vec::with_capacity(8);
    match clima {
        Some(c) => {
            let nivel = |aviso: bool, peligro: bool| {
                if peligro {
                    2
                } else if aviso {
                    1
                } else {
                    0
                }
            };
            v.push(indicador(
                &format!("{:.0}°C", c.temperatura_c),
                "TEMP",
                nivel(
                    c.temperatura_c > 32.0 || c.temperatura_c < 5.0,
                    c.temperatura_c > 38.0 || c.temperatura_c < 0.0,
                ),
            ));
            v.push(indicador(&format!("{:.0}%", c.humedad_pct), "HUMEDAD", 0));
            v.push(indicador(
                &format!("{:.0}", c.viento_kmh),
                "VIENTO KM/H",
                nivel(c.viento_kmh > 40.0, c.viento_kmh > 60.0),
            ));
            v.push(indicador(
                &format!("{:.0}", c.uv),
                "UV",
                nivel(c.uv >= 6.0, c.uv >= 8.0),
            ));
            v.push(indicador(
                &format!("{:.0}", c.presion_hpa),
                "PRESIÓN HPA",
                0,
            ));
        }
        None => {
            for e in ["TEMP", "HUMEDAD", "VIENTO KM/H", "UV", "PRESIÓN HPA"] {
                v.push(sin(e));
            }
        }
    }
    match aire {
        Some(a) => {
            let estado = match a.calidad {
                CalidadAire::Buena | CalidadAire::Aceptable => 0,
                CalidadAire::Moderada => 1,
                _ => 2,
            };
            v.push(indicador(&format!("{:.0}%", a.aire_pct), "AIRE", estado));
            v.push(indicador(&format!("{:.0}", a.pm2_5), "PM2.5", estado));
        }
        None => {
            v.push(sin("AIRE"));
            v.push(sin("PM2.5"));
        }
    }
    v.push(sin("ENLACE"));
    v
}

fn indicador(valor: &str, etiqueta: &str, estado: i32) -> DatoIndicador {
    DatoIndicador {
        valor: valor.into(),
        etiqueta: etiqueta.into(),
        estado,
    }
}

fn nombre_categoria(c: CategoriaClima) -> &'static str {
    match c {
        CategoriaClima::Tormenta => "Tormenta",
        CategoriaClima::VientoFuerte => "Viento fuerte",
        CategoriaClima::Lluvia => "Lluvia",
        CategoriaClima::Caluroso => "Caluroso",
        CategoriaClima::Frio => "Frío",
        CategoriaClima::Fresco => "Fresco",
    }
}

fn iniciales(nombre: &str) -> String {
    nombre
        .split_whitespace()
        .filter_map(|p| p.chars().next())
        .take(2)
        .flat_map(char::to_uppercase)
        .collect()
}

fn capitalizar(s: &str) -> String {
    let mut c = s.chars();
    c.next()
        .map(|p| p.to_uppercase().chain(c).collect())
        .unwrap_or_default()
}

fn modelo<T: Clone + 'static>(v: Vec<T>) -> ModelRc<T> {
    ModelRc::new(VecModel::from(v))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iniciales_de_una_o_varias_palabras() {
        assert_eq!(iniciales("Schormeiker Lugo"), "SL");
        assert_eq!(iniciales("ana"), "A");
        assert_eq!(iniciales(""), "");
    }

    #[test]
    fn trazado_normaliza_al_maximo() {
        assert_eq!(
            trazado(&[0.0, 2.0, 1.0], 2.0),
            "M 0.0 100.0 L 300.0 0.0 L 600.0 50.0"
        );
        assert_eq!(trazado(&[1.0], 1.0), "");
    }

    #[test]
    fn sin_clima_ni_aire_no_se_inventan_valores() {
        let v = telemetria(None, None);
        assert_eq!(v.len(), 8);
        assert!(v.iter().all(|d| d.estado == 3 && d.valor == "—"));
    }
}
