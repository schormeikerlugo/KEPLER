-- ============================================
-- Taxonomía: Categorías, Subcategorías, Etiquetas
-- Migración para Mars-Sight AR
-- ============================================

-- 1. Tabla de Categorías
CREATE TABLE IF NOT EXISTS categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    color TEXT DEFAULT '#3498db',
    icono TEXT DEFAULT 'folder',
    orden INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Subcategorías
CREATE TABLE IF NOT EXISTS subcategorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID REFERENCES categorias(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(categoria_id, nombre)
);

-- 3. Tabla de Etiquetas
CREATE TABLE IF NOT EXISTS etiquetas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#2ecc71',
    uso_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de relación Objeto-Etiquetas (Many-to-Many)
CREATE TABLE IF NOT EXISTS objeto_etiquetas (
    objeto_id UUID REFERENCES objetos_exploracion(id) ON DELETE CASCADE,
    etiqueta_id UUID REFERENCES etiquetas(id) ON DELETE CASCADE,
    PRIMARY KEY (objeto_id, etiqueta_id)
);

-- 5. Agregar columnas de taxonomía a objetos_exploracion
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

-- 6. Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_subcategorias_categoria ON subcategorias(categoria_id);
CREATE INDEX IF NOT EXISTS idx_objetos_categoria ON objetos_exploracion(categoria_id);
CREATE INDEX IF NOT EXISTS idx_objetos_subcategoria ON objetos_exploracion(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_objeto_etiquetas_objeto ON objeto_etiquetas(objeto_id);
CREATE INDEX IF NOT EXISTS idx_objeto_etiquetas_etiqueta ON objeto_etiquetas(etiqueta_id);

-- ============================================
-- Catálogo Inicial de Categorías
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
-- Subcategorías Iniciales
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

-- Etiquetas comunes iniciales
INSERT INTO etiquetas (nombre, color) VALUES
    ('importante', '#e74c3c'),
    ('frecuente', '#3498db'),
    ('favorito', '#f1c40f'),
    ('peligro', '#c0392b'),
    ('temporal', '#95a5a6'),
    ('verificado', '#27ae60')
ON CONFLICT (nombre) DO NOTHING;
