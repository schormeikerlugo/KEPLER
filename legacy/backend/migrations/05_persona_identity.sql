-- Migration: Add identity fields to personas_encontradas

ALTER TABLE public.personas_encontradas
    ADD COLUMN IF NOT EXISTS rasgos_fisicos text,
    ADD COLUMN IF NOT EXISTS hostilidad text DEFAULT 'desconocido';

-- Index for faster hostilidad filtering
CREATE INDEX IF NOT EXISTS idx_personas_hostilidad
    ON public.personas_encontradas(hostilidad);
