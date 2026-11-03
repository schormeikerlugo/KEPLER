//! Panel de la Unidad de Campo (paridad con el dashboard móvil de la PWA):
//! telemetría del entorno, consejo, avisos, explorador, misiones, objetos,
//! POIs, personas, rutas y distancia semanal. Todo se calcula aquí; SwiftUI
//! solo lo pinta.

use chrono::{DateTime, Datelike, NaiveDate, Utc};
use kepler_core::consejos::{self, Situacion};
use kepler_core::entorno::{CalidadAire, CategoriaClima};
use serde_json::Value;

/// Estado de un indicador: cómo se colorea.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum Nivel {
    Bien,
    Aviso,
    Peligro,
    /// Sin dato: se muestra `—` en gris (nunca valores inventados).
    SinDato,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Indicador {
    pub valor: String,
    pub etiqueta: String,
    pub nivel: Nivel,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Atencion {
    pub cantidad: u32,
    /// «POI» / «POIs»…
    pub resaltado: String,
    pub texto: String,
    /// Símbolo SF.
    pub simbolo: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct MisionFila {
    pub id: String,
    pub codigo: String,
    pub titulo: String,
    pub estado: String,
    /// Segundos Unix.
    pub creado_en: i64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct DiaSemana {
    pub etiqueta: String,
    pub km: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CategoriaConteo {
    pub id: String,
    pub nombre: String,
    /// `#RRGGBB`.
    pub color: String,
    pub total: u32,
    /// Solo POIs: reportes compartidos por otros exploradores.
    pub compartidos: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ObjetoFila {
    /// Última captura con ese nombre.
    pub id: String,
    pub nombre: String,
    pub categoria: String,
    pub color: String,
    pub total: u32,
}

/// Persona o POI en una lista.
#[derive(Debug, Clone, uniffi::Record)]
pub struct HallazgoFila {
    pub id: String,
    pub nombre: String,
    /// Hostilidad (personas) o nivel de riesgo (POIs).
    pub nivel: String,
    pub imagen_path: Option<String>,
    pub capturado_en: i64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct RutaFila {
    pub nombre: String,
    pub distancia_km: Option<f64>,
    pub seguridad: String,
    pub registrada: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Panel {
    pub indicadores: Vec<Indicador>,
    /// «Fresco», «Lluvia»… o `None` sin datos de clima.
    pub clima: Option<String>,
    pub es_dia: bool,
    pub ubicacion: String,
    /// Ubicación del GPS (`false`: aproximada por IP o desconocida).
    pub ubicacion_gps: bool,
    pub consejo: String,
    pub atenciones: Vec<Atencion>,
    /// Desgaste del calzado y resistencia, en %.
    pub desgaste_calzado: Option<f64>,
    pub resistencia: Option<f64>,
    /// Horas hasta volver al 90 % de resistencia (0 si ya está recuperado).
    pub recuperacion_h: Option<f64>,
    pub misiones_completadas: u32,
    pub distancia_total_km: f64,
    pub resumen: crate::Resumen,
    pub misiones: Vec<MisionFila>,
    pub semana: Vec<DiaSemana>,
    pub semana_total_km: f64,
    pub objetos_por_categoria: Vec<CategoriaConteo>,
    pub objetos_frecuentes: Vec<ObjetoFila>,
    pub pois_por_categoria: Vec<CategoriaConteo>,
    pub personas: Vec<HallazgoFila>,
    pub rutas: Vec<RutaFila>,
}

/// Respuestas de la API que entran al panel (las que fallaron, `None`).
pub(crate) struct Fuentes {
    pub dashboard: Value,
    pub explorador: Option<Value>,
    pub aire: Option<Value>,
    pub ubicacion_ip: Option<String>,
    pub gps: bool,
    pub latencia_ms: Option<u32>,
}

pub(crate) fn construir(f: &Fuentes, consejo: impl FnOnce(&Situacion) -> String) -> Panel {
    let d = &f.dashboard;
    let clima = f
        .explorador
        .as_ref()
        .map(|e| &e["clima"])
        .filter(|c| c["disponible"] == true);
    let categoria: Option<CategoriaClima> =
        clima.and_then(|c| serde_json::from_value(c["categoria"].clone()).ok());
    let aire = f.aire.as_ref().filter(|a| a["disponible"] == true);
    let a = &d["alertas"];
    let situacion = Situacion {
        desgaste_calzado: f
            .explorador
            .as_ref()
            .and_then(|e| e["desgaste_calzado"].as_f64()),
        resistencia: f
            .explorador
            .as_ref()
            .and_then(|e| e["resistencia"].as_f64()),
        clima: categoria,
        pois_riesgo_alto: a["pois_riesgo_alto"].as_u64().unwrap_or(0),
        misiones_sin_reporte: a["misiones_sin_reporte"].as_u64().unwrap_or(0),
    };
    let semana: Vec<DiaSemana> = d["semana"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|s| DiaSemana {
            etiqueta: s["fecha"]
                .as_str()
                .and_then(|t| t.parse::<NaiveDate>().ok())
                .map(|f| DIAS[f.weekday().num_days_from_monday() as usize])
                .unwrap_or("?")
                .to_owned(),
            km: s["distancia_km"].as_f64().unwrap_or(0.0),
        })
        .collect();
    Panel {
        indicadores: telemetria(clima, aire, f.latencia_ms),
        clima: categoria.map(|c| nombre_clima(c).to_owned()),
        es_dia: clima.is_none_or(|c| c["es_dia"] != false),
        ubicacion: clima
            .and_then(|c| c["ubicacion"].as_str().map(str::to_owned))
            .or_else(|| f.ubicacion_ip.clone())
            .unwrap_or_else(|| "Desconocida".into()),
        ubicacion_gps: f.gps,
        consejo: consejo(&situacion),
        atenciones: atenciones(a),
        desgaste_calzado: situacion.desgaste_calzado,
        resistencia: situacion.resistencia,
        recuperacion_h: f
            .explorador
            .as_ref()
            .and_then(|e| e["recuperacion_h"].as_f64()),
        misiones_completadas: f
            .explorador
            .as_ref()
            .map_or(0, |e| n(&e["misiones_completadas"])),
        distancia_total_km: f
            .explorador
            .as_ref()
            .and_then(|e| e["distancia_total_km"].as_f64())
            .unwrap_or(0.0),
        resumen: crate::resumen_desde(d),
        misiones: d["recientes"]["misiones"]
            .as_array()
            .into_iter()
            .flatten()
            .map(mision)
            .collect(),
        semana_total_km: semana.iter().map(|s| s.km).sum(),
        semana,
        objetos_por_categoria: d["objetos_por_categoria"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|c| CategoriaConteo {
                id: texto(c, "categoria_id"),
                nombre: texto(c, "nombre"),
                color: color(c),
                total: n(&c["total"]),
                compartidos: 0,
            })
            .collect(),
        objetos_frecuentes: d["objetos_frecuentes"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|o| ObjetoFila {
                id: texto(o, "ultimo_id"),
                nombre: texto(o, "nombre"),
                categoria: texto(o, "categoria"),
                color: color(o),
                total: n(&o["total"]),
            })
            .collect(),
        pois_por_categoria: d["pois_por_categoria"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|k| CategoriaConteo {
                id: texto(k, "categoria_id"),
                nombre: texto(k, "nombre"),
                color: color(k),
                total: n(&k["propios"]),
                compartidos: n(&k["compartidos"]),
            })
            .collect(),
        personas: d["recientes"]["personas"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|p| hallazgo(p, "hostilidad"))
            .collect(),
        rutas: d["recientes"]["rutas"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|r| RutaFila {
                nombre: texto(r, "nombre"),
                distancia_km: r["distancia_km"].as_f64(),
                seguridad: r["seguridad"].as_str().unwrap_or("desconocido").to_owned(),
                registrada: r["origen"] == "registrada",
            })
            .collect(),
    }
}

pub(crate) fn mision(m: &Value) -> MisionFila {
    MisionFila {
        id: texto(m, "id"),
        codigo: texto(m, "codigo"),
        titulo: m["titulo"]
            .as_str()
            .filter(|t| !t.is_empty())
            .map_or_else(|| texto(m, "codigo"), str::to_owned),
        estado: texto(m, "estado"),
        creado_en: segundos(&m["creado_en"]),
    }
}

/// Fila de persona (`hostilidad`) o POI (`nivel_riesgo`).
pub(crate) fn hallazgo(v: &Value, campo_nivel: &str) -> HallazgoFila {
    HallazgoFila {
        id: texto(v, "id"),
        nombre: texto(v, "nombre"),
        nivel: v[campo_nivel].as_str().unwrap_or("desconocido").to_owned(),
        imagen_path: v["imagen_path"].as_str().map(str::to_owned),
        capturado_en: segundos(&v["capturado_en"]),
    }
}

const DIAS: [&str; 7] = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/// Ocho indicadores como en el escritorio: clima, aire y enlace.
fn telemetria(
    clima: Option<&Value>,
    aire: Option<&Value>,
    latencia_ms: Option<u32>,
) -> Vec<Indicador> {
    let ind = |valor: String, etiqueta: &str, nivel| Indicador {
        valor,
        etiqueta: etiqueta.into(),
        nivel,
    };
    let sin = |etiqueta: &str| ind("—".into(), etiqueta, Nivel::SinDato);
    let nivel = |aviso: bool, peligro: bool| match (aviso, peligro) {
        (_, true) => Nivel::Peligro,
        (true, _) => Nivel::Aviso,
        _ => Nivel::Bien,
    };
    let mut v = Vec::with_capacity(8);
    match clima {
        Some(c) => {
            let t = c["temperatura_c"].as_f64().unwrap_or(0.0);
            let viento = c["viento_kmh"].as_f64().unwrap_or(0.0);
            let uv = c["uv"].as_f64().unwrap_or(0.0);
            v.push(ind(
                format!("{t:.0}°C"),
                "Temp",
                nivel(t > 32.0 || t < 5.0, t > 38.0 || t < 0.0),
            ));
            v.push(ind(
                format!("{:.0}%", c["humedad_pct"].as_f64().unwrap_or(0.0)),
                "Humedad",
                Nivel::Bien,
            ));
            v.push(ind(
                format!("{viento:.0}"),
                "Viento km/h",
                nivel(viento > 40.0, viento > 60.0),
            ));
            v.push(ind(format!("{uv:.0}"), "UV", nivel(uv >= 6.0, uv >= 8.0)));
            v.push(ind(
                format!("{:.0}", c["presion_hpa"].as_f64().unwrap_or(0.0)),
                "Presión hPa",
                Nivel::Bien,
            ));
        }
        None => {
            for e in ["Temp", "Humedad", "Viento km/h", "UV", "Presión hPa"] {
                v.push(sin(e));
            }
        }
    }
    match aire {
        Some(a) => {
            let calidad: Option<CalidadAire> = serde_json::from_value(a["calidad"].clone()).ok();
            let nivel = match calidad {
                Some(CalidadAire::Buena | CalidadAire::Aceptable) => Nivel::Bien,
                Some(CalidadAire::Moderada) => Nivel::Aviso,
                Some(_) => Nivel::Peligro,
                None => Nivel::SinDato,
            };
            v.push(ind(
                format!("{:.0}%", a["aire_pct"].as_f64().unwrap_or(0.0)),
                "Aire",
                nivel,
            ));
            v.push(ind(
                format!("{:.0}", a["pm2_5"].as_f64().unwrap_or(0.0)),
                "PM2.5",
                nivel,
            ));
        }
        None => {
            v.push(sin("Aire"));
            v.push(sin("PM2.5"));
        }
    }
    v.push(match latencia_ms {
        Some(ms) => ind(format!("{ms} ms"), "Enlace", nivel(ms > 300, ms > 1000)),
        None => sin("Enlace"),
    });
    v
}

fn atenciones(a: &Value) -> Vec<Atencion> {
    [
        (
            "pois_riesgo_alto",
            ("POI", "POIs"),
            "de riesgo alto o crítico",
            "exclamationmark.triangle.fill",
        ),
        (
            "personas_hostiles",
            ("Persona", "Personas"),
            "con nivel hostil",
            "person.fill.xmark",
        ),
        (
            "misiones_sin_reporte",
            ("Misión", "Misiones"),
            "sin documentar",
            "doc.text",
        ),
        (
            "objetos_baja_confianza",
            ("Objeto", "Objetos"),
            "no reconocido",
            "questionmark.square.dashed",
        ),
    ]
    .into_iter()
    .filter_map(|(clave, (uno, varios), texto, simbolo)| {
        let cantidad = n(&a[clave]);
        (cantidad > 0).then(|| Atencion {
            cantidad,
            resaltado: if cantidad == 1 { uno } else { varios }.into(),
            // «no reconocido» concuerda en número; el resto no cambia
            texto: if cantidad > 1 && texto.ends_with("reconocido") {
                format!("{texto}s")
            } else {
                texto.into()
            },
            simbolo: simbolo.into(),
        })
    })
    .collect()
}

fn nombre_clima(c: CategoriaClima) -> &'static str {
    match c {
        CategoriaClima::Tormenta => "Tormenta",
        CategoriaClima::VientoFuerte => "Viento fuerte",
        CategoriaClima::Lluvia => "Lluvia",
        CategoriaClima::Caluroso => "Caluroso",
        CategoriaClima::Frio => "Frío",
        CategoriaClima::Fresco => "Fresco",
    }
}

/// Consejo con semilla del reloj.
pub(crate) fn consejo_ahora(s: &Situacion) -> String {
    consejos::consejo(s, Utc::now().timestamp_subsec_nanos() as usize)
}

fn texto(v: &Value, campo: &str) -> String {
    v[campo].as_str().unwrap_or_default().to_owned()
}

fn n(v: &Value) -> u32 {
    u32::try_from(v.as_u64().unwrap_or(0)).unwrap_or(u32::MAX)
}

fn color(v: &Value) -> String {
    v["color"].as_str().unwrap_or("#888888").to_owned()
}

fn segundos(v: &Value) -> i64 {
    v.as_str()
        .and_then(|s| s.parse::<DateTime<Utc>>().ok())
        .map_or(0, |d| d.timestamp())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn fuentes() -> Fuentes {
        Fuentes {
            dashboard: json!({
                "conteos": { "misiones": 2, "misiones_activas": 1, "objetos": 3, "personas": 1, "puntos_interes": 1, "rutas": 1, "reportes_compartidos": 0 },
                "alertas": { "pois_riesgo_alto": 1, "personas_hostiles": 0, "misiones_sin_reporte": 2, "objetos_baja_confianza": 0 },
                "recientes": {
                    "misiones": [{ "id": "m1", "codigo": "MISION-1", "titulo": "", "estado": "activa", "creado_en": "2026-11-01T12:00:00Z" }],
                    "personas": [{ "id": "p1", "nombre": "Guardaparques", "hostilidad": "aliado", "capturado_en": "2026-11-01T12:00:00Z" }],
                    "rutas": [{ "nombre": "Cresta", "seguridad": "precaucion", "origen": "planificada", "distancia_km": null }]
                },
                "semana": [{ "fecha": "2026-11-01", "distancia_km": 2.5 }, { "fecha": "2026-11-02", "distancia_km": 1.0 }],
                "objetos_por_categoria": [{ "categoria_id": null, "nombre": "Sin categoría", "color": "#888888", "total": 3 }],
                "pois_por_categoria": [{ "categoria_id": "k", "nombre": "Peligros", "color": "#ff4444", "propios": 1, "compartidos": 2 }]
            }),
            explorador: Some(
                json!({ "desgaste_calzado": 12.0, "resistencia": 80.0, "misiones_completadas": 4,
                "clima": { "disponible": true, "temperatura_c": 24.6, "humedad_pct": 70, "viento_kmh": 45, "uv": 9, "presion_hpa": 1012,
                           "es_dia": false, "categoria": "viento_fuerte", "ubicacion": "Caracas" } }),
            ),
            aire: None,
            ubicacion_ip: Some("IP".into()),
            gps: true,
            latencia_ms: Some(40),
        }
    }

    #[test]
    fn panel_desde_la_api() {
        let p = construir(&fuentes(), consejo_ahora);
        let niveles: Vec<Nivel> = p.indicadores.iter().map(|i| i.nivel).collect();
        assert_eq!(
            niveles,
            [
                Nivel::Bien,
                Nivel::Bien,
                Nivel::Aviso,
                Nivel::Peligro,
                Nivel::Bien,
                Nivel::SinDato,
                Nivel::SinDato,
                Nivel::Bien
            ]
        );
        assert_eq!(p.indicadores[0].valor, "25°C");
        assert_eq!(
            (p.clima.as_deref(), p.es_dia, p.ubicacion.as_str()),
            (Some("Viento fuerte"), false, "Caracas")
        );
        assert_eq!(p.atenciones.len(), 2);
        assert_eq!(p.atenciones[1].resaltado, "Misiones");
        assert_eq!(p.misiones[0].titulo, "MISION-1");
        assert_eq!(p.semana[0].etiqueta, "Dom");
        assert!((p.semana_total_km - 3.5).abs() < 1e-9);
        assert_eq!(
            (
                p.pois_por_categoria[0].total,
                p.pois_por_categoria[0].compartidos
            ),
            (1, 2)
        );
        assert_eq!(p.personas[0].nivel, "aliado");
        assert!(!p.rutas[0].registrada);
    }

    #[test]
    fn sin_explorador_ni_clima() {
        let mut f = fuentes();
        f.explorador = None;
        f.latencia_ms = None;
        let p = construir(&f, consejo_ahora);
        assert!(p.indicadores.iter().all(|i| i.nivel == Nivel::SinDato));
        assert_eq!((p.ubicacion.as_str(), p.clima), ("IP", None));
        assert!(p.desgaste_calzado.is_none());
    }
}
