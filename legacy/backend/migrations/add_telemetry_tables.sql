-- Telemetry Tables Migration
-- Creates tables for mission telemetry data collection

-- 1. Telemetry Samples (high-frequency GPS data)
CREATE TABLE IF NOT EXISTS telemetry_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id UUID NOT NULL REFERENCES misiones(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    altitude DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient mission queries
CREATE INDEX IF NOT EXISTS idx_telemetry_samples_mission 
ON telemetry_samples(mission_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_samples_timestamp 
ON telemetry_samples(mission_id, timestamp);


-- 2. Mission Telemetry Summary
CREATE TABLE IF NOT EXISTS mission_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id UUID UNIQUE NOT NULL REFERENCES misiones(id) ON DELETE CASCADE,
    
    -- Route data
    route_geojson JSONB,
    distance_meters DOUBLE PRECISION DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    
    -- Speed stats
    avg_speed_mps DOUBLE PRECISION DEFAULT 0,
    max_speed_mps DOUBLE PRECISION DEFAULT 0,
    
    -- Counts
    sample_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for mission queries
CREATE INDEX IF NOT EXISTS idx_mission_telemetry_mission 
ON mission_telemetry(mission_id);


-- 3. Function for incremental telemetry updates
CREATE OR REPLACE FUNCTION update_mission_telemetry(
    p_mission_id UUID,
    p_distance_delta DOUBLE PRECISION,
    p_max_speed DOUBLE PRECISION,
    p_sample_count INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    -- Try to update existing record
    UPDATE mission_telemetry
    SET 
        distance_meters = distance_meters + p_distance_delta,
        max_speed_mps = GREATEST(max_speed_mps, p_max_speed),
        sample_count = sample_count + p_sample_count,
        updated_at = NOW()
    WHERE mission_id = p_mission_id;
    
    -- If no record exists, create one
    IF NOT FOUND THEN
        INSERT INTO mission_telemetry (mission_id, distance_meters, max_speed_mps, sample_count)
        VALUES (p_mission_id, p_distance_delta, p_max_speed, p_sample_count);
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 4. Function to generate GeoJSON route from samples
CREATE OR REPLACE FUNCTION generate_mission_route(p_mission_id UUID)
RETURNS JSONB AS $$
DECLARE
    route_line JSONB;
BEGIN
    SELECT jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object(
            'mission_id', p_mission_id
        ),
        'geometry', jsonb_build_object(
            'type', 'LineString',
            'coordinates', (
                SELECT jsonb_agg(
                    jsonb_build_array(lng, lat, COALESCE(altitude, 0))
                    ORDER BY timestamp
                )
                FROM telemetry_samples
                WHERE mission_id = p_mission_id
            )
        )
    ) INTO route_line;
    
    -- Update mission_telemetry with route
    UPDATE mission_telemetry
    SET route_geojson = route_line
    WHERE mission_id = p_mission_id;
    
    RETURN route_line;
END;
$$ LANGUAGE plpgsql;


-- 5. Enable RLS
ALTER TABLE telemetry_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_telemetry ENABLE ROW LEVEL SECURITY;

-- Policies (simplified - adjust based on your auth setup)
CREATE POLICY "Users can manage their telemetry"
ON telemetry_samples FOR ALL
USING (
    mission_id IN (
        SELECT id FROM misiones WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their mission telemetry"
ON mission_telemetry FOR ALL
USING (
    mission_id IN (
        SELECT id FROM misiones WHERE user_id = auth.uid()
    )
);
