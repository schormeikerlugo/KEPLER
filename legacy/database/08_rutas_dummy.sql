-- Phase 6: Dummy Data for Routes
-- Seeding 'rutas_exploracion' to visualize dashboard analytics.

-- Retrieve a valid User ID to assign these routes
-- Note: Replace 'ALICE-UUID-HERE' with your real user_id if needed, 
-- or we can use the first available user.
DO $$ 
DECLARE
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.rutas_exploracion 
            (user_id, nombre, dificultad, seguridad, notas, lat_inicio, lng_inicio, lat_fin, lng_fin, distancia_km)
        VALUES
            (v_user_id, 'Ruta Delta-4 (Borde Norte)', 'alta', 'peligro', 'Presencia anómala detectada. Terreno inestable.', 40.7128, -74.0060, 40.7580, -73.9855, 12.4),
            (v_user_id, 'Suministros Perímetro Sur', 'baja', 'seguro', 'Ruta despejada. Puestos de control activos.', 34.0522, -118.2437, 34.0736, -118.4004, 25.1),
            (v_user_id, 'Sector Echo (Ruinas Industriales)', 'moderada', 'precaucion', 'Radiación basal alta, pero pasable con equipo nivel 2.', 51.5074, -0.1278, 51.5200, -0.1500, 4.8),
            (v_user_id, 'Patrulla Perimetral Alpha', 'baja', 'seguro', 'Guardia de rutina sin eventos destacables.', 48.8566, 2.3522, 48.8600, 2.3600, 2.1),
            (v_user_id, 'Ruta Omega-9 (Zona Prohibida)', 'extrema', 'peligro', 'Ruta bloqueada por escombros, requiere desvío. Actividad de hostiles.', 35.6895, 139.6917, 35.7100, 139.7300, 8.5);
        
        RAISE NOTICE '5 rutas dummy insertadas exitosamente para el usuario %', v_user_id;
    ELSE
        RAISE NOTICE 'No se encontró un usuario en auth.users para asignar las rutas.';
    END IF;
END $$;
