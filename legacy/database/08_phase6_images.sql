-- Phase 6: Visual Enrichment
-- Añadir soporte universal de imágenes a las tablas de exploración

-- Añadir image_url a puntos_interes (Asentamientos/Bases)
ALTER TABLE public.puntos_interes
ADD COLUMN IF NOT EXISTS image_url text;

-- Asegurarnos que rutas_exploracion tenga soporte para fotos de reconocimiento
ALTER TABLE public.rutas_exploracion
ADD COLUMN IF NOT EXISTS image_url text;

-- (Opcional) Guardar el script para correr en Supabase.
