-- Migration: Add 'generic' entity type to match_entity_by_embedding
-- Allows re-identification of objetos_exploracion (not just personas/POIs)
--
-- NOTE: `nombre` columns in personas_encontradas / puntos_interes /
-- objetos_exploracion are declared as `varchar(200)` (or similar). We cast
-- to TEXT explicitly so the RETURNS TABLE signature matches and Postgres
-- doesn't raise:
--   "structure of query does not match function result type ...
--    Returned type character varying(200) does not match expected type text"

CREATE OR REPLACE FUNCTION match_entity_by_embedding(
    query_embedding vector(512),
    entity_type text,     -- 'persona', 'poi', or 'generic'
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
        SELECT pe.id, pe.nombre::text,
               1 - (pe.embedding <=> query_embedding) AS similarity
        FROM public.personas_encontradas pe
        WHERE pe.embedding IS NOT NULL
          AND 1 - (pe.embedding <=> query_embedding) >= match_threshold
        ORDER BY pe.embedding <=> query_embedding
        LIMIT match_count;
    ELSIF entity_type = 'poi' THEN
        RETURN QUERY
        SELECT pi.id, pi.nombre::text,
               1 - (pi.embedding <=> query_embedding) AS similarity
        FROM public.puntos_interes pi
        WHERE pi.embedding IS NOT NULL
          AND 1 - (pi.embedding <=> query_embedding) >= match_threshold
        ORDER BY pi.embedding <=> query_embedding
        LIMIT match_count;
    ELSIF entity_type = 'generic' THEN
        RETURN QUERY
        SELECT oe.id, oe.nombre::text,
               1 - (oe.embedding <=> query_embedding) AS similarity
        FROM public.objetos_exploracion oe
        WHERE oe.embedding IS NOT NULL
          AND 1 - (oe.embedding <=> query_embedding) >= match_threshold
        ORDER BY oe.embedding <=> query_embedding
        LIMIT match_count;
    END IF;
END;
$$;

-- Index for fast similarity search on objetos_exploracion
CREATE INDEX IF NOT EXISTS idx_objetos_embedding
    ON public.objetos_exploracion
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);
