-- ============================================================
-- MARS-SIGHT AR - MIGRACIÓN COMPLETA CONSOLIDADA
-- Ejecutar en orden para crear toda la estructura de BD
-- Fecha: 2024-12-29
-- ============================================================

-- ============================================
-- PASO 1: EXTENSIONES REQUERIDAS
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- PASO 2: TABLA DE MISIONES
-- ============================================
CREATE TABLE IF NOT EXISTS misiones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  codigo text,          -- e.g. "MISION-2025-001"
  titulo text,          -- e.g. "Exploración Sector Norte"
  estado text DEFAULT 'activa',  -- 'activa', 'completada', 'abortada'
  inicio_at timestamptz DEFAULT now(),
  fin_at timestamptz,
  zona_geografica text, -- e.g. "Nido del Aguila"
  zona text,            -- Zona simplificada
  clima_snapshot jsonb DEFAULT '{}'::jsonb
);

-- ============================================
-- PASO 3: TABLA DE OBJETOS DE EXPLORACIÓN
-- ============================================
CREATE TABLE IF NOT EXISTS objetos_exploracion (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  mission_id uuid REFERENCES misiones(id),
  
  nombre text,
  tipo text,        -- 'marker', 'person', 'plant', etc.
  descripcion text,
  subcategoria text,
  genero text,
  
  -- Geospatial
  posicion geography(Point, 4326),
  
  -- AI / Data
  embedding vector(512),
  metadata jsonb DEFAULT '{}'::jsonb,
  contexto_ambiental jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

-- Índices para objetos
CREATE INDEX IF NOT EXISTS idx_obj_mission ON objetos_exploracion(mission_id);
CREATE INDEX IF NOT EXISTS idx_obj_pos ON objetos_exploracion USING GIST(posicion);

-- ============================================
-- PASO 4: TABLAS DE TAXONOMÍA
-- ============================================

-- Categorías
CREATE TABLE IF NOT EXISTS categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    color TEXT DEFAULT '#3498db',
    icono TEXT DEFAULT 'folder',
    orden INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subcategorías
CREATE TABLE IF NOT EXISTS subcategorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID REFERENCES categorias(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(categoria_id, nombre)
);

-- Etiquetas
CREATE TABLE IF NOT EXISTS etiquetas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#2ecc71',
    uso_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relación Objeto-Etiquetas (Many-to-Many)
CREATE TABLE IF NOT EXISTS objeto_etiquetas (
    objeto_id UUID REFERENCES objetos_exploracion(id) ON DELETE CASCADE,
    etiqueta_id UUID REFERENCES etiquetas(id) ON DELETE CASCADE,
    PRIMARY KEY (objeto_id, etiqueta_id)
);

-- Agregar columnas de taxonomía a objetos
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'objetos_exploracion' AND column_name = 'categoria_id') THEN
        ALTER TABLE objetos_exploracion ADD COLUMN categoria_id UUID REFERENCES categorias(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'objetos_exploracion' AND column_name = 'subcategoria_id') THEN
        ALTER TABLE objetos_exploracion ADD COLUMN subcategoria_id UUID REFERENCES subcategorias(id);
    END IF;
END $$;

-- Índices de taxonomía
CREATE INDEX IF NOT EXISTS idx_subcategorias_categoria ON subcategorias(categoria_id);
CREATE INDEX IF NOT EXISTS idx_objetos_categoria ON objetos_exploracion(categoria_id);
CREATE INDEX IF NOT EXISTS idx_objetos_subcategoria ON objetos_exploracion(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_objeto_etiquetas_objeto ON objeto_etiquetas(objeto_id);
CREATE INDEX IF NOT EXISTS idx_objeto_etiquetas_etiqueta ON objeto_etiquetas(etiqueta_id);

-- ============================================
-- PASO 5: TABLA DE CHAT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON public.chat_logs(user_id);

-- ============================================
-- PASO 6: FUNCIONES RPC
-- ============================================

-- Búsqueda de objetos similares por embedding
CREATE OR REPLACE FUNCTION search_similar_objects(
    query_embedding vector(512),
    match_threshold float DEFAULT 0.75,
    match_count int DEFAULT 3
)
RETURNS TABLE (
    id uuid,
    nombre text,
    tipo text,
    lat float,
    lng float,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        objetos_exploracion.id,
        objetos_exploracion.nombre,
        objetos_exploracion.tipo,
        ST_Y(objetos_exploracion.posicion::geometry) as lat,
        ST_X(objetos_exploracion.posicion::geometry) as lng,
        objetos_exploracion.metadata,
        1 - (objetos_exploracion.embedding <=> query_embedding) as similarity
    FROM objetos_exploracion
    WHERE objetos_exploracion.embedding IS NOT NULL
        AND 1 - (objetos_exploracion.embedding <=> query_embedding) > match_threshold
    ORDER BY objetos_exploracion.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Estadísticas de misión
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

-- ============================================
-- PASO 7: DATOS INICIALES - CATEGORÍAS
-- ============================================
INSERT INTO categorias (nombre, descripcion, color, icono, orden) VALUES
    ('Personas', 'Individuos y grupos de personas', '#3498db', 'user', 1),
    ('Animales', 'Fauna doméstica y salvaje', '#27ae60', 'paw', 2),
    ('Vehículos', 'Medios de transporte', '#e74c3c', 'car', 3),
    ('Lugares', 'Ubicaciones y espacios', '#9b59b6', 'map-pin', 4),
    ('Mobiliario', 'Muebles y equipamiento', '#f39c12', 'home', 5),
    ('Tecnología', 'Dispositivos electrónicos', '#1abc9c', 'smartphone', 6),
    ('Alimentos', 'Comida y bebidas', '#e67e22', 'coffee', 7),
    ('Señales', 'Indicadores y advertencias', '#c0392b', 'alert-triangle', 8),
    ('Objetos Personales', 'Pertenencias y accesorios', '#8e44ad', 'briefcase', 9),
    ('Naturaleza', 'Flora y elementos naturales', '#16a085', 'leaf', 10),
    ('Infraestructura', 'Construcciones y estructuras', '#7f8c8d', 'building', 11),
    ('Sin Clasificar', 'Objetos pendientes de categorizar', '#95a5a6', 'help-circle', 99)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- PASO 8: DATOS INICIALES - SUBCATEGORÍAS
-- ============================================

-- Personas
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Familia', 'Miembros de la familia' FROM categorias WHERE nombre = 'Personas'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Amigos', 'Amigos y conocidos cercanos' FROM categorias WHERE nombre = 'Personas'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Compañeros', 'Colegas de trabajo o estudio' FROM categorias WHERE nombre = 'Personas'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Desconocidos', 'Personas no identificadas' FROM categorias WHERE nombre = 'Personas'
ON CONFLICT DO NOTHING;

-- Animales
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Mascotas', 'Animales domésticos' FROM categorias WHERE nombre = 'Animales'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Salvajes', 'Animales en libertad' FROM categorias WHERE nombre = 'Animales'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Aves', 'Pájaros y aves' FROM categorias WHERE nombre = 'Animales'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Insectos', 'Insectos y arácnidos' FROM categorias WHERE nombre = 'Animales'
ON CONFLICT DO NOTHING;

-- Vehículos
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Automóviles', 'Autos y camionetas' FROM categorias WHERE nombre = 'Vehículos'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Motocicletas', 'Motos y scooters' FROM categorias WHERE nombre = 'Vehículos'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Bicicletas', 'Bicicletas y similares' FROM categorias WHERE nombre = 'Vehículos'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Transporte Público', 'Buses, metros, taxis' FROM categorias WHERE nombre = 'Vehículos'
ON CONFLICT DO NOTHING;

-- Lugares
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Hogar', 'Casa y residencia' FROM categorias WHERE nombre = 'Lugares'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Trabajo', 'Oficina y lugar de trabajo' FROM categorias WHERE nombre = 'Lugares'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Comercios', 'Tiendas y locales' FROM categorias WHERE nombre = 'Lugares'
ON CONFLICT DO NOTHING;
INSERT INTO subcategorias (categoria_id, nombre, descripcion) 
SELECT id, 'Espacios Públicos', 'Parques, plazas, calles' FROM categorias WHERE nombre = 'Lugares'
ON CONFLICT DO NOTHING;

-- ============================================
-- PASO 9: DATOS INICIALES - ETIQUETAS
-- ============================================
INSERT INTO etiquetas (nombre, color) VALUES
    ('importante', '#e74c3c'),
    ('frecuente', '#3498db'),
    ('favorito', '#f1c40f'),
    ('peligro', '#c0392b'),
    ('temporal', '#95a5a6'),
    ('verificado', '#27ae60')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- FIN DE MIGRACIÓN
-- ============================================
