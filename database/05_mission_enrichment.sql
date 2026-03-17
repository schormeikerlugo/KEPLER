-- Phase 1: Enrich Mission Start Flow
-- Add context columns to misiones table

ALTER TABLE public.misiones ADD COLUMN IF NOT EXISTS tipo_terreno text;
ALTER TABLE public.misiones ADD COLUMN IF NOT EXISTS objetivo text;
ALTER TABLE public.misiones ADD COLUMN IF NOT EXISTS dificultad text;
ALTER TABLE public.misiones ADD COLUMN IF NOT EXISTS coords_inicio jsonb;
