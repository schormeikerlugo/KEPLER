-- Create RPC for geospatial search on NEW objects table
-- Returns explicit Lat/Lng to avoid WKB parsing issues on frontend
DROP FUNCTION IF EXISTS public.search_nearby_objects_v2(float, float, float);

CREATE OR REPLACE FUNCTION public.search_nearby_objects_v2(p_lat float, p_lng float, radius_meters float)
RETURNS TABLE (
    id uuid,
    mission_id uuid,
    nombre text,
    tipo text,
    descripcion text,
    created_at timestamptz,
    lat float,
    lng float,
    metadata jsonb,
    subcategoria text,
    genero text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.mission_id,
    o.nombre,
    o.tipo,
    o.descripcion,
    o.created_at,
    ST_Y(o.posicion::geometry) as lat,
    ST_X(o.posicion::geometry) as lng,
    o.metadata,
    o.subcategoria,
    o.genero
  FROM public.objetos_exploracion o
  WHERE ST_DWithin(
    o.posicion::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    radius_meters
  );
END;
$$;
