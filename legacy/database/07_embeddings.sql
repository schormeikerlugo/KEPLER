-- Phase: AI Re-Identification Foundations + Geotracking

-- Enable pgvector if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns for visual re-identification
ALTER TABLE public.personas_encontradas
    ADD COLUMN IF NOT EXISTS embedding vector(512);

ALTER TABLE public.puntos_interes
    ADD COLUMN IF NOT EXISTS embedding vector(512);

-- Indexes for fast similarity search (ivfflat)
-- Note: These require at least ~100 rows to be effective
-- For small datasets, exact search (no index) is fine
CREATE INDEX IF NOT EXISTS idx_personas_embedding
    ON public.personas_encontradas
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);

CREATE INDEX IF NOT EXISTS idx_pois_embedding
    ON public.puntos_interes
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);

-- Geotracking column for missions
ALTER TABLE public.misiones
    ADD COLUMN IF NOT EXISTS geotrack jsonb DEFAULT '[]'::jsonb;

-- SQL function for entity matching by embedding
CREATE OR REPLACE FUNCTION match_entity_by_embedding(
    query_embedding vector(512),
    entity_type text,     -- 'persona' or 'poi'
    match_threshold float DEFAULT 0.85,
    match_count int DEFAULT 3
)
RETURNS TABLE (
    id uuid,
    nombre text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF entity_type = 'persona' THEN
        RETURN QUERY
        SELECT pe.id, pe.nombre,
               1 - (pe.embedding <=> query_embedding) AS similarity
        FROM public.personas_encontradas pe
        WHERE pe.embedding IS NOT NULL
          AND 1 - (pe.embedding <=> query_embedding) >= match_threshold
        ORDER BY pe.embedding <=> query_embedding
        LIMIT match_count;
    ELSIF entity_type = 'poi' THEN
        RETURN QUERY
        SELECT pi.id, pi.nombre,
               1 - (pi.embedding <=> query_embedding) AS similarity
        FROM public.puntos_interes pi
        WHERE pi.embedding IS NOT NULL
          AND 1 - (pi.embedding <=> query_embedding) >= match_threshold
        ORDER BY pi.embedding <=> query_embedding
        LIMIT match_count;
    END IF;
END;
$$;
