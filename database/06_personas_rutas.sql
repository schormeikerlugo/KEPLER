-- Phase 2-4: New exploration entity tables

-- Personas Encontradas
CREATE TABLE IF NOT EXISTS public.personas_encontradas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    mission_id uuid REFERENCES public.misiones(id) ON DELETE SET NULL,
    nombre text NOT NULL,
    alias text,
    contexto text DEFAULT 'desconocido',
    notas text,
    lat double precision,
    lng double precision,
    image_url text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.personas_encontradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own personas" ON public.personas_encontradas
    FOR ALL USING (auth.uid() = user_id);

-- Rutas de Exploración
CREATE TABLE IF NOT EXISTS public.rutas_exploracion (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    mission_id uuid REFERENCES public.misiones(id) ON DELETE SET NULL,
    nombre text NOT NULL,
    dificultad text DEFAULT 'moderada',
    seguridad text DEFAULT 'precaucion',
    notas text,
    lat_inicio double precision,
    lng_inicio double precision,
    lat_fin double precision,
    lng_fin double precision,
    distancia_km double precision,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.rutas_exploracion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rutas" ON public.rutas_exploracion
    FOR ALL USING (auth.uid() = user_id);
