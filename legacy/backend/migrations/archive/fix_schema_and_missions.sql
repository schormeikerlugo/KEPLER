-- INIT SCHEMA & MISSIONS
-- Run this to ensure all tables exist

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Missions Table
CREATE TABLE IF NOT EXISTS misiones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  codigo text,
  titulo text,
  estado text DEFAULT 'activa',
  inicio_at timestamptz DEFAULT now(),
  fin_at timestamptz,
  zona_geografica text,
  clima_snapshot jsonb DEFAULT '{}'::jsonb
);

-- 3. Objects Table (objetos_exploracion)
CREATE TABLE IF NOT EXISTS objetos_exploracion (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  mission_id uuid REFERENCES misiones(id), -- Link to Mission
  
  nombre text,
  tipo text,        -- 'marker', 'person', 'plant', etc.
  descripcion text,
  
  -- Geospatial
  posicion geography(Point, 4326),
  
  -- AI / Data
  embedding vector(512),
  metadata jsonb DEFAULT '{}'::jsonb, -- Stores context, image_base64, etc.
  contexto_ambiental jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_obj_mission ON objetos_exploracion(mission_id);
CREATE INDEX IF NOT EXISTS idx_obj_pos ON objetos_exploracion USING GIST(posicion);

-- 5. Fix/Recreate Functions if needed (Optional, just to be safe)
-- (Search function depends on this table, so ensure it exists)