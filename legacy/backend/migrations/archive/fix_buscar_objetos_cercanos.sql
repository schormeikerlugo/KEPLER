-- Fix buscar_objetos_cercanos to return lat/lng as separate columns
-- This replaces the binary 'posicion' with readable float coordinates

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS buscar_objetos_cercanos(float, float, float);

CREATE OR REPLACE FUNCTION buscar_objetos_cercanos (
  lat float,
  lon float,
  radio_metros float
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  tipo text,
  descripcion text,
  posicion geography,
  lat float,
  lng float,
  embedding vector(512),
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE sql
AS $$
  SELECT 
    id,
    user_id,
    nombre,
    tipo,
    descripcion,
    posicion,
    ST_Y(posicion::geometry) as lat,  -- Extract latitude
    ST_X(posicion::geometry) as lng,  -- Extract longitude
    embedding,
    metadata,
    created_at
  FROM objetos_exploracion
  WHERE st_dwithin(
    posicion,
    st_setsrid(st_makepoint(lon, lat), 4326)::geography,
    radio_metros
  )
  -- Ordenar por distancia (los más cercanos primero)
  ORDER BY posicion <-> st_setsrid(st_makepoint(lon, lat), 4326)::geography;
$$;
