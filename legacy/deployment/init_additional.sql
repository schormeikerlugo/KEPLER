-- Mars-Sight AR - Complete Database Setup
-- This script sets up all required tables and functions for the project

-- ============================================
-- 1. CHAT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Conversation',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chats" ON public.chat_logs;
CREATE POLICY "Users can view own chats" ON public.chat_logs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own chats" ON public.chat_logs;
CREATE POLICY "Users can insert own chats" ON public.chat_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own chats" ON public.chat_logs;
CREATE POLICY "Users can update own chats" ON public.chat_logs
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own chats" ON public.chat_logs;
CREATE POLICY "Users can delete own chats" ON public.chat_logs
    FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON public.chat_logs TO authenticated;
GRANT ALL ON public.chat_logs TO service_role;

-- ============================================
-- 2. GET ALL OBJECTS WITH COORDINATES FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_all_objects_with_coords()
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    description TEXT,
    metadata JSONB,
    mission_id UUID,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        o.id,
        o.nombre as name,
        o.tipo as type,
        ST_Y(o.posicion::geometry) as lat,
        ST_X(o.posicion::geometry) as lng,
        o.descripcion as description,
        o.metadata,
        o.mission_id,
        o.created_at
    FROM objetos_exploracion o
    ORDER BY o.created_at DESC
    LIMIT 200;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_objects_with_coords() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_objects_with_coords() TO anon;
GRANT EXECUTE ON FUNCTION get_all_objects_with_coords() TO service_role;

-- ============================================
-- 3. SEARCH NEARBY OBJECTS FUNCTION (with distance)
-- ============================================
CREATE OR REPLACE FUNCTION search_nearby_objects_v2(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    max_distance INTEGER DEFAULT 1000
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    description TEXT,
    metadata JSONB,
    mission_id UUID
) AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        o.id,
        o.nombre as name,
        o.tipo as type,
        ST_Y(o.posicion::geometry) as lat,
        ST_X(o.posicion::geometry) as lng,
        ST_Distance(
            o.posicion::geography,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) as distance_meters,
        o.descripcion as description,
        o.metadata,
        o.mission_id
    FROM objetos_exploracion o
    WHERE ST_DWithin(
        o.posicion::geography,
        ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
        max_distance
    )
    ORDER BY distance_meters ASC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION search_nearby_objects_v2(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_nearby_objects_v2(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION search_nearby_objects_v2(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO service_role;

SELECT 'Mars-Sight AR database setup complete!' as status;
