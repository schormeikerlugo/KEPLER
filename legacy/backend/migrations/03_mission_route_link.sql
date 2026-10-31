-- ============================================================
-- Mission-Route Linking Migration
-- Date: 2026-04-01
-- Purpose: Link planned routes to missions
-- Dependencies: misiones table, rutas_planificadas table
-- ============================================================

-- Add route reference to missions
ALTER TABLE public.misiones ADD COLUMN IF NOT EXISTS ruta_planificada_id UUID REFERENCES public.rutas_planificadas(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_misiones_ruta_planificada ON public.misiones(ruta_planificada_id);