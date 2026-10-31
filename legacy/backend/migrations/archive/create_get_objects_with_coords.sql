-- Function to get all objects with lat/lng extracted from PostGIS geometry
CREATE OR REPLACE FUNCTION get_all_objects_with_coords()
RETURNS TABLE (
    id UUID,
    nombre TEXT,
    tipo TEXT,
    descripcion TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    metadata JSONB,
    mission_id UUID,
    created_at TIMESTAMPTZ,
    subcategoria TEXT,
    genero TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.nombre,
        o.tipo,
        o.descripcion,
        ST_Y(o.posicion::geometry) AS lat,
        ST_X(o.posicion::geometry) AS lng,
        o.metadata,
        o.mission_id,
        o.created_at,
        o.subcategoria,
        o.genero
    FROM objetos_exploracion o
    ORDER BY o.created_at DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;
