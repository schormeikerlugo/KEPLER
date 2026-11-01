//! Herramientas de Cortex: consultas de solo lectura que el modelo puede pedir.
//! Corren como el usuario (RLS): Cortex solo ve lo que el explorador puede ver.

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
            "Busca objetos, personas o puntos de interés propios por nombre o descripción (sin texto: los más recientes).",
            json!({ "type": "object", "properties": {
                "texto": { "type": "string" },
                "tipo": { "type": "string", "enum": ["objetos", "personas", "puntos_interes"] },
                "limite": { "type": "integer", "description": "Máximo de resultados (1-30, por defecto 10)" }
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
            consulta(
                "select coalesce((select jsonb_build_object(
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
                  from public.misiones m
                  where m.eliminado_en is null and (m.codigo ilike $1 or m.titulo ilike '%' || $1 || '%')
                  order by m.creado_en desc limit 1),
                  jsonb_build_object('error', 'no hay ninguna misión con ese código o título'))",
            )
            .bind(busqueda)
            .fetch_one(&mut *tx)
            .await
        }
        "buscar_hallazgos" => consulta(
            "select coalesce(jsonb_agg(h), '[]') from (
                select * from (
                    select 'objeto' as tipo, nombre, descripcion as detalle, clase_yolo as nivel, lat, lng, capturado_en
                    from public.objetos
                    where user_id = (select auth.uid()) and eliminado_en is null and ($2::text is null or $2 = 'objetos')
                      and ($1::text is null or nombre ilike '%' || $1 || '%' or descripcion ilike '%' || $1 || '%')
                    union all
                    select 'persona', nombre, rasgos_fisicos, hostilidad, lat, lng, capturado_en
                    from public.personas
                    where eliminado_en is null and ($2::text is null or $2 = 'personas')
                      and ($1::text is null or nombre ilike '%' || $1 || '%' or rasgos_fisicos ilike '%' || $1 || '%')
                    union all
                    select 'poi', nombre, descripcion, nivel_riesgo, lat, lng, capturado_en
                    from public.puntos_interes
                    where user_id = (select auth.uid()) and eliminado_en is null and ($2::text is null or $2 = 'puntos_interes')
                      and ($1::text is null or nombre ilike '%' || $1 || '%' or descripcion ilike '%' || $1 || '%')
                ) t order by capturado_en desc limit $3) h",
        )
        .bind(texto("texto"))
        .bind(texto("tipo"))
        .bind(entero("limite", 10, 30))
        .fetch_one(&mut *tx)
        .await,
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
