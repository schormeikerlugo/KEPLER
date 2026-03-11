DO $$
DECLARE
    r RECORD;
    v_uid UUID;
    v_mis1 UUID;
    v_mis2 UUID;
    v_cat_min UUID;
    v_cat_ani UUID;
    v_cat_pla UUID;
    v_cat_ene UUID;
BEGIN
    SELECT id INTO v_cat_min FROM categorias WHERE nombre ILIKE '%mineral%' LIMIT 1;
    SELECT id INTO v_cat_ani FROM categorias WHERE nombre ILIKE '%animal%' LIMIT 1;
    SELECT id INTO v_cat_pla FROM categorias WHERE nombre ILIKE '%planta%' LIMIT 1;
    SELECT id INTO v_cat_ene FROM categorias WHERE nombre ILIKE '%energ%' LIMIT 1;

    -- Pick exactly the schormeikerl user
    SELECT id INTO v_uid FROM auth.users WHERE email = 'schormeikerl@gmail.com';
    IF v_uid IS NULL THEN RAISE NOTICE 'No user schormeikerl'; RETURN; END IF;

    -- Seed misiones
    INSERT INTO misiones (user_id, codigo, titulo, estado, inicio_at, zona) VALUES
        (v_uid, 'EXP-B201', 'Exploración de Prueba', 'activa', now() - interval '2 days', 'Valle Norte')
    RETURNING id INTO v_mis1;
    INSERT INTO misiones (user_id, codigo, titulo, estado, inicio_at, fin_at, zona) VALUES
        (v_uid, 'EXP-B202', 'Análisis Geológico', 'completada', now() - interval '5 days', now() - interval '4 days', 'Cráter Sur')
    RETURNING id INTO v_mis2;

    -- Seed objetos
    IF v_cat_min IS NOT NULL THEN
        INSERT INTO objetos_exploracion (user_id, mission_id, nombre, tipo, confianza, categoria_id) VALUES
            (v_uid, v_mis1, 'Basalto Oscuro', 'Mineral', 0.92, v_cat_min),
            (v_uid, v_mis2, 'Cristal de Sal', 'Mineral', 0.81, v_cat_min);
    END IF;
    IF v_cat_ani IS NOT NULL THEN
        INSERT INTO objetos_exploracion (user_id, mission_id, nombre, tipo, confianza, categoria_id) VALUES
            (v_uid, v_mis1, 'Zorro Andino', 'Animal', 0.88, v_cat_ani),
            (v_uid, v_mis1, 'Ave Desconocida', 'Animal', 0.45, v_cat_ani); -- low confidence for AI warning
    END IF;
    IF v_cat_pla IS NOT NULL THEN
        INSERT INTO objetos_exploracion (user_id, mission_id, nombre, tipo, confianza, categoria_id) VALUES
            (v_uid, v_mis2, 'Musgo Ártico', 'Planta', 0.99, v_cat_pla);
    END IF;

    -- Seed Personas
    INSERT INTO entidades_biometricas (user_id, nombre, categoria, zona_localizado, hostilidad, image_url) VALUES
        (v_uid, 'Dra. Elena', 'Investigadores', 'Campamento 2', 'Aliado', 'https://i.pravatar.cc/150?u=10'),
        (v_uid, 'Guardia Central', 'Seguridad', 'Perímetro', 'Neutral', 'https://i.pravatar.cc/150?u=11');

    -- Seed Rutas
    INSERT INTO rutas_planificadas (user_id, nombre, punto_control_destino, distancia_total, estado_seguridad) VALUES
        (v_uid, 'Sector 7G', 'Punto de Observación', 3.4, 'Seguro'),
        (v_uid, 'Valle Peligroso', 'Cueva Norte', 8.1, 'Riesgo Alto');
    
    -- Seed GPS
    INSERT INTO telemetry_samples (mission_id, lat, lng, timestamp) VALUES
        (v_mis1, 10.48, -66.90, now() - interval '1 day'),
        (v_mis1, 10.49, -66.91, now() - interval '12 hours');

    RAISE NOTICE 'Seeded successfully for schormeikerl';
END;
$$;
