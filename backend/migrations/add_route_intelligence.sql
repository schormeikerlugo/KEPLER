-- ============================================================
-- Route Intelligence Migration
-- Date: 2026-03-31
-- Purpose: Spatial corridor search, risk assessment, visual matching
-- Dependencies: PostGIS, pgvector, existing tables
-- ============================================================

-- ============================================================
-- 1. MISSING TABLE: rutas_planificadas (referenced in explorer_stats.py)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rutas_planificadas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    nombre text NOT NULL,
    punto_control_destino text,
    distancia_total numeric(10,2),
    estado_seguridad text DEFAULT 'Desconocido',
    tipo_terreno text DEFAULT 'llano',
    waypoints jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.rutas_planificadas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'rutas_planificadas' AND policyname = 'Users manage own planned routes'
    ) THEN
        CREATE POLICY "Users manage own planned routes" ON public.rutas_planificadas
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================================
-- 2. SIMPLE INDEXES ON LAT/LNG COLUMNS
-- These replace GIST spatial indexes which require special setup in Supabase
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_puntos_interes_pos 
    ON public.puntos_interes (lat, lng) 
    WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personas_pos 
    ON public.personas_encontradas (lat, lng) 
    WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rutas_exploracion_inicio 
    ON public.rutas_exploracion (lat_inicio, lng_inicio) 
    WHERE lat_inicio IS NOT NULL AND lng_inicio IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rutas_exploracion_fin 
    ON public.rutas_exploracion (lat_fin, lng_fin) 
    WHERE lat_fin IS NOT NULL AND lng_fin IS NOT NULL;

-- ============================================================
-- 3. HELPER: Build LINESTRING from waypoints JSONB
-- ============================================================

CREATE OR REPLACE FUNCTION build_route_line(waypoints JSONB)
RETURNS geometry(LineString, 4326)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    point_count INT;
    line_geom geometry(LineString, 4326);
BEGIN
    point_count := jsonb_array_length(waypoints);

    IF point_count < 2 THEN
        RAISE EXCEPTION 'At least 2 waypoints are required, got %', point_count;
    END IF;

    SELECT ST_MakeLine(
        ARRAY(
            SELECT ST_SetSRID(
                ST_MakePoint(
                    (elem->>'lng')::double precision,
                    (elem->>'lat')::double precision
                ), 4326
            )
            FROM jsonb_array_elements(waypoints) AS elem
        )
    ) INTO line_geom;

    RETURN line_geom;
END;
$$;

-- ============================================================
-- 4. MAIN FUNCTION: Search all entities in route corridor
-- ============================================================

CREATE OR REPLACE FUNCTION search_route_corridor(
    waypoints JSONB,
    buffer_meters INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    route_line geometry;
    corridor geometry;
    route_length_km DOUBLE PRECISION;
    result JSONB;

    objects_data JSONB;
    pois_data JSONB;
    personas_data JSONB;
    rutas_data JSONB;
BEGIN
    -- Build corridor geometry
    route_line := build_route_line(waypoints);
    corridor := ST_Buffer(route_line::geography, buffer_meters)::geometry;
    route_length_km := ST_Length(route_line::geography) / 1000.0;

    -- 1. Objects in corridor (objetos_exploracion)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'nombre', o.nombre,
        'tipo', o.tipo,
        'descripcion', o.descripcion,
        'lat', ST_Y(o.posicion::geometry),
        'lng', ST_X(o.posicion::geometry),
        'distancia_m', ROUND(ST_Distance(
            o.posicion::geography,
            ST_ClosestPoint(route_line, o.posicion::geometry)::geography
        )),
        'user_id', o.user_id,
        'mission_id', o.mission_id,
        'metadata', o.metadata,
        'created_at', o.created_at
    ) ORDER BY ST_Distance(
        o.posicion::geography,
        ST_ClosestPoint(route_line, o.posicion::geometry)::geography
    )), '[]'::jsonb)
    INTO objects_data
    FROM objetos_exploracion o
    WHERE o.posicion IS NOT NULL
      AND ST_Intersects(o.posicion::geometry, corridor);

    -- 2. POIs in corridor (puntos_interes)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'zona', p.zona,
        'nivel_riesgo', p.nivel_riesgo,
        'estado', p.estado,
        'descripcion', p.descripcion,
        'lat', p.lat,
        'lng', p.lng,
        'distancia_m', ROUND(ST_Distance(
            ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
            ST_ClosestPoint(route_line, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))::geography
        )),
        'user_id', p.user_id,
        'categoria_id', p.categoria_id,
        'created_at', p.created_at
    ) ORDER BY ST_Distance(
        ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
        ST_ClosestPoint(route_line, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))::geography
    )), '[]'::jsonb)
    INTO pois_data
    FROM puntos_interes p
    WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
      AND p.estado = 'activo'
      AND ST_Intersects(ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326), corridor);

    -- 3. Persons in corridor (personas_encontradas)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'nombre', pe.nombre,
        'alias', pe.alias,
        'contexto', pe.contexto,
        'hostilidad', COALESCE(pe.hostilidad, 'Desconocido'),
        'notas', pe.notas,
        'lat', pe.lat,
        'lng', pe.lng,
        'distancia_m', ROUND(ST_Distance(
            ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326)::geography,
            ST_ClosestPoint(route_line, ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326))::geography
        )),
        'user_id', pe.user_id,
        'image_url', pe.image_url,
        'created_at', pe.created_at
    ) ORDER BY ST_Distance(
        ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326)::geography,
        ST_ClosestPoint(route_line, ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326))::geography
    )), '[]'::jsonb)
    INTO personas_data
    FROM personas_encontradas pe
    WHERE pe.lat IS NOT NULL AND pe.lng IS NOT NULL
      AND ST_Intersects(ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326), corridor);

    -- 4. Other routes crossing the corridor (rutas_exploracion)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'nombre', r.nombre,
        'seguridad', r.seguridad,
        'dificultad', r.dificultad,
        'distancia_km', r.distancia_km,
        'notas', r.notas,
        'user_id', r.user_id,
        'lat_inicio', r.lat_inicio,
        'lng_inicio', r.lng_inicio,
        'lat_fin', r.lat_fin,
        'lng_fin', r.lng_fin,
        'created_at', r.created_at
    )), '[]'::jsonb)
    INTO rutas_data
    FROM rutas_exploracion r
    WHERE r.lat_inicio IS NOT NULL AND r.lng_inicio IS NOT NULL
      AND r.lat_fin IS NOT NULL AND r.lng_fin IS NOT NULL
      AND ST_Intersects(
          ST_MakeLine(
              ST_SetSRID(ST_MakePoint(r.lng_inicio, r.lat_inicio), 4326),
              ST_SetSRID(ST_MakePoint(r.lng_fin, r.lat_fin), 4326)
          ),
          corridor
      );

    -- Build final result
    result := jsonb_build_object(
        'corridor_distance_km', ROUND(route_length_km::numeric, 2),
        'buffer_meters', buffer_meters,
        'objects', objects_data,
        'pois', pois_data,
        'personas', personas_data,
        'rutas', rutas_data
    );

    RETURN result;
END;
$$;

-- ============================================================
-- 5. VISUAL SIMILARITY SEARCH in corridor
-- ============================================================

CREATE OR REPLACE FUNCTION search_similar_in_corridor(
    waypoints JSONB,
    query_embedding vector(512),
    buffer_meters INT DEFAULT 200,
    match_threshold FLOAT DEFAULT 0.75,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    nombre TEXT,
    tipo TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distancia_m DOUBLE PRECISION,
    similarity DOUBLE PRECISION,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    route_line geometry;
    corridor geometry;
BEGIN
    route_line := build_route_line(waypoints);
    corridor := ST_Buffer(route_line::geography, buffer_meters)::geometry;

    RETURN QUERY
    SELECT
        o.id,
        o.nombre,
        o.tipo,
        ST_Y(o.posicion::geometry) as lat,
        ST_X(o.posicion::geometry) as lng,
        ST_Distance(
            o.posicion::geography,
            ST_ClosestPoint(route_line, o.posicion::geometry)::geography
        ) as distancia_m,
        1 - (o.embedding <=> query_embedding) as similarity,
        o.metadata
    FROM objetos_exploracion o
    WHERE o.posicion IS NOT NULL
      AND o.embedding IS NOT NULL
      AND ST_Intersects(o.posicion::geometry, corridor)
      AND 1 - (o.embedding <=> query_embedding) > match_threshold
    ORDER BY o.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================
-- 6. RISK ASSESSMENT for a route
-- ============================================================

CREATE OR REPLACE FUNCTION get_route_risk_assessment(
    waypoints JSONB,
    buffer_meters INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    route_line geometry;
    corridor geometry;
    route_length_km DOUBLE PRECISION;

    -- Counts
    peligros_criticos INT := 0;
    peligros_altos INT := 0;
    peligros_medios INT := 0;
    hostiles INT := 0;
    neutrales INT := 0;
    aliados INT := 0;
    rutas_peligrosas INT := 0;
    objetos_count INT := 0;

    -- Alertas
    alertas JSONB := '[]'::jsonb;
    nivel_global TEXT := 'bajo';
    score INT := 0;

    rec RECORD;
BEGIN
    route_line := build_route_line(waypoints);
    corridor := ST_Buffer(route_line::geography, buffer_meters)::geometry;
    route_length_km := ST_Length(route_line::geography) / 1000.0;

    -- Count POIs by risk level
    FOR rec IN
        SELECT p.nivel_riesgo, p.nombre, p.lat, p.lng,
               ST_Distance(
                   ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
                   ST_ClosestPoint(route_line, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))::geography
               ) as dist_m
        FROM puntos_interes p
        WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
          AND p.estado = 'activo'
          AND ST_Intersects(ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326), corridor)
    LOOP
        CASE rec.nivel_riesgo
            WHEN 'critico' THEN
                peligros_criticos := peligros_criticos + 1;
                score := score + 40;
                alertas := alertas || jsonb_build_object(
                    'tipo', 'critical',
                    'mensaje', rec.nombre || ' (riesgo crítico) a ' || ROUND(rec.dist_m) || 'm',
                    'distancia_m', ROUND(rec.dist_m),
                    'lat', rec.lat,
                    'lng', rec.lng
                );
            WHEN 'alto' THEN
                peligros_altos := peligros_altos + 1;
                score := score + 20;
                alertas := alertas || jsonb_build_object(
                    'tipo', 'danger',
                    'mensaje', rec.nombre || ' (riesgo alto) a ' || ROUND(rec.dist_m) || 'm',
                    'distancia_m', ROUND(rec.dist_m),
                    'lat', rec.lat,
                    'lng', rec.lng
                );
            WHEN 'medio' THEN
                peligros_medios := peligros_medios + 1;
                score := score + 5;
            WHEN 'bajo' THEN
                score := score + 1;
        END CASE;
    END LOOP;

    -- Count persons by hostility
    FOR rec IN
        SELECT pe.hostilidad, pe.nombre, pe.contexto, pe.lat, pe.lng,
               ST_Distance(
                   ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326)::geography,
                   ST_ClosestPoint(route_line, ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326))::geography
               ) as dist_m
        FROM personas_encontradas pe
        WHERE pe.lat IS NOT NULL AND pe.lng IS NOT NULL
          AND ST_Intersects(ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326), corridor)
    LOOP
        CASE COALESCE(rec.hostilidad, 'Desconocido')
            WHEN 'Hostil' THEN
                hostiles := hostiles + 1;
                score := score + 30;
                alertas := alertas || jsonb_build_object(
                    'tipo', 'danger',
                    'mensaje', rec.nombre || ' (hostil) reportado a ' || ROUND(rec.dist_m) || 'm',
                    'distancia_m', ROUND(rec.dist_m),
                    'lat', rec.lat,
                    'lng', rec.lng
                );
            WHEN 'Neutral' THEN
                neutrales := neutrales + 1;
                IF rec.contexto ILIKE '%asentamiento%' OR rec.contexto ILIKE '%base%' THEN
                    score := score + 3;
                    alertas := alertas || jsonb_build_object(
                        'tipo', 'settlement',
                        'mensaje', 'Asentamiento "' || rec.nombre || '" a ' || ROUND(rec.dist_m) || 'm',
                        'distancia_m', ROUND(rec.dist_m),
                        'lat', rec.lat,
                        'lng', rec.lng
                    );
                END IF;
            WHEN 'Aliado' THEN
                aliados := aliados + 1;
                score := score - 5;
                alertas := alertas || jsonb_build_object(
                    'tipo', 'info',
                    'mensaje', 'Aliado "' || rec.nombre || '" a ' || ROUND(rec.dist_m) || 'm',
                    'distancia_m', ROUND(rec.dist_m),
                    'lat', rec.lat,
                    'lng', rec.lng
                );
            ELSE
                score := score + 2;
        END CASE;
    END LOOP;

    -- Count dangerous routes crossing
    SELECT COUNT(*) INTO rutas_peligrosas
    FROM rutas_exploracion r
    WHERE r.lat_inicio IS NOT NULL AND r.lng_inicio IS NOT NULL
      AND r.lat_fin IS NOT NULL AND r.lng_fin IS NOT NULL
      AND r.seguridad = 'peligro'
      AND ST_Intersects(
          ST_MakeLine(
              ST_SetSRID(ST_MakePoint(r.lng_inicio, r.lat_inicio), 4326),
              ST_SetSRID(ST_MakePoint(r.lng_fin, r.lng_fin), 4326)
          ),
          corridor
      );

    score := score + (rutas_peligrosas * 15);

    IF rutas_peligrosas > 0 THEN
        alertas := alertas || jsonb_build_object(
            'tipo', 'warning',
            'mensaje', rutas_peligrosas || ' ruta(s) peligrosa(s) cruzan tu trayectoria'
        );
    END IF;

    -- Count objects in corridor
    SELECT COUNT(*) INTO objetos_count
    FROM objetos_exploracion o
    WHERE o.posicion IS NOT NULL
      AND ST_Intersects(o.posicion::geometry, corridor);

    IF objetos_count > 0 THEN
        alertas := alertas || jsonb_build_object(
            'tipo', 'info',
            'mensaje', objetos_count || ' objeto(s) detectado(s) por otros exploradores en la zona'
        );
    END IF;

    -- Determine overall risk level
    IF score >= 60 THEN nivel_global := 'critico';
    ELSIF score >= 30 THEN nivel_global := 'alto';
    ELSIF score >= 10 THEN nivel_global := 'medio';
    ELSE nivel_global := 'bajo';
    END IF;

    RETURN jsonb_build_object(
        'nivel_riesgo', nivel_global,
        'score', score,
        'corridor_km', ROUND(route_length_km::numeric, 2),
        'stats', jsonb_build_object(
            'peligros_criticos', peligros_criticos,
            'peligros_altos', peligros_altos,
            'peligros_medios', peligros_medios,
            'hostiles', hostiles,
            'neutrales', neutrales,
            'aliados', aliados,
            'rutas_peligrosas', rutas_peligrosas,
            'objetos_cerca', objetos_count
        ),
        'alertas', alertas
    );
END;
$$;

-- ============================================================
-- 7. NEARBY ALERTS (for real-time exploration)
-- ============================================================

CREATE OR REPLACE FUNCTION get_nearby_alerts(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_meters INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    user_point geography;
    result JSONB;

    peligros JSONB;
    hostiles JSONB;
    rutas_cercanas JSONB;
    objetos_cercanos JSONB;
    alertas JSONB := '[]'::jsonb;
BEGIN
    user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

    -- Nearby dangers
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'nivel_riesgo', p.nivel_riesgo,
        'distancia_m', ROUND(ST_Distance(
            ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
            user_point
        )),
        'lat', p.lat,
        'lng', p.lng
    )), '[]'::jsonb)
    INTO peligros
    FROM puntos_interes p
    WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
      AND p.estado = 'activo'
      AND p.nivel_riesgo IN ('alto', 'critico')
      AND ST_DWithin(ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography, user_point, radius_meters);

    -- Nearby hostile persons
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'nombre', pe.nombre,
        'hostilidad', COALESCE(pe.hostilidad, 'Desconocido'),
        'contexto', pe.contexto,
        'distancia_m', ROUND(ST_Distance(
            ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326)::geography,
            user_point
        )),
        'lat', pe.lat,
        'lng', pe.lng
    )), '[]'::jsonb)
    INTO hostiles
    FROM personas_encontradas pe
    WHERE pe.lat IS NOT NULL AND pe.lng IS NOT NULL
      AND COALESCE(pe.hostilidad, 'Desconocido') IN ('Hostil', 'Desconocido')
      AND ST_DWithin(ST_SetSRID(ST_MakePoint(pe.lng, pe.lat), 4326)::geography, user_point, radius_meters);

    -- Nearby dangerous routes
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'nombre', r.nombre,
        'seguridad', r.seguridad,
        'distancia_m', ROUND(ST_Distance(
            ST_ClosestPoint(
                ST_MakeLine(
                    ST_SetSRID(ST_MakePoint(r.lng_inicio, r.lat_inicio), 4326),
                    ST_SetSRID(ST_MakePoint(r.lng_fin, r.lat_fin), 4326)
                ),
                ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)
            )::geography,
            user_point
        ))
    )), '[]'::jsonb)
    INTO rutas_cercanas
    FROM rutas_exploracion r
    WHERE r.lat_inicio IS NOT NULL AND r.lng_inicio IS NOT NULL
      AND r.lat_fin IS NOT NULL AND r.lng_fin IS NOT NULL
      AND r.seguridad = 'peligro'
      AND ST_DWithin(
          ST_MakeLine(
              ST_SetSRID(ST_MakePoint(r.lng_inicio, r.lat_inicio), 4326),
              ST_SetSRID(ST_MakePoint(r.lng_fin, r.lat_fin), 4326)
          )::geography,
          user_point,
          radius_meters
      );

    -- Nearby objects (from other users)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'nombre', o.nombre,
        'tipo', o.tipo,
        'distancia_m', ROUND(ST_Distance(o.posicion::geography, user_point)),
        'user_id', o.user_id
    )), '[]'::jsonb)
    INTO objetos_cercanos
    FROM objetos_exploracion o
    WHERE o.posicion IS NOT NULL
      AND ST_DWithin(o.posicion::geography, user_point, radius_meters);

    -- Generate alert messages
    IF jsonb_array_length(peligros) > 0 THEN
        alertas := alertas || jsonb_build_object(
            'tipo', 'critical',
            'mensaje', peligros->0->>'nombre' || ' a ' || (peligros->0->>'distancia_m') || 'm'
        );
    END IF;

    IF jsonb_array_length(hostiles) > 0 THEN
        alertas := alertas || jsonb_build_object(
            'tipo', 'danger',
            'mensaje', hostiles->0->>'nombre' || ' (hostil) a ' || (hostiles->0->>'distancia_m') || 'm'
        );
    END IF;

    IF jsonb_array_length(rutas_cercanas) > 0 THEN
        alertas := alertas || jsonb_build_object(
            'tipo', 'warning',
            'mensaje', 'Ruta peligrosa "' || (rutas_cercanas->0->>'nombre') || '" a ' || (rutas_cercanas->0->>'distancia_m') || 'm'
        );
    END IF;

    RETURN jsonb_build_object(
        'peligros', peligros,
        'hostiles', hostiles,
        'rutas_peligrosas', rutas_cercanas,
        'objetos', objetos_cercanos,
        'alertas', alertas
    );
END;
$$;