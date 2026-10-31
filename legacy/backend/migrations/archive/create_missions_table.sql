-- Phase 9: Missions Architecture & Enhanced Context

-- 1. Create Missions Table
CREATE TABLE IF NOT EXISTS misiones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  codigo text,          -- e.g. "MISION-2025-001"
  titulo text,          -- e.g. "Exploración Sector Norte"
  estado text DEFAULT 'activa',  -- 'activa', 'completada', 'abortada'
  inicio_at timestamptz DEFAULT now(),
  fin_at timestamptz,
  zona_geografica text, -- e.g. "Nido del Aguila"
  clima_snapshot jsonb DEFAULT '{}'::jsonb -- { temp: "22C", o2: "98%" }
);

-- 2. Link Objects to Missions & Add Context
ALTER TABLE objetos_exploracion 
ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES misiones(id),
ADD COLUMN IF NOT EXISTS contexto_ambiental jsonb DEFAULT '{}'::jsonb;

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS idx_objetos_mission ON objetos_exploracion(mission_id);

-- 4. RPC for Mission Statistics (Optional but useful)
CREATE OR REPLACE FUNCTION get_mission_stats(mission_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  obj_count int;
BEGIN
  SELECT count(*) INTO obj_count FROM objetos_exploracion WHERE mission_id = mission_uuid;
  RETURN json_build_object(
    'object_count', obj_count
  );
END;
$$;
