-- Phase 8: Vector Similarity Search Function
-- Creates a PostgreSQL function to search for visually similar objects using pgvector

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

-- Test the function (should return empty if no objects with embeddings exist yet)
-- SELECT * FROM search_similar_objects(
--     (SELECT embedding FROM objetos_exploracion WHERE embedding IS NOT NULL LIMIT 1),
--     0.75,
--     3
-- );
