-- 1. Buscamos al usuario de prueba (lenovics73@gmail.com)
-- 2. Insertamos una misión fantasma con coordenadas GPS (geotrack) en formato Array crudo
INSERT INTO public.misiones (
    id,
    codigo, 
    titulo, 
    user_id, 
    estado, 
    zona_geografica, 
    geotrack, 
    inicio_at, 
    fin_at
)
VALUES (
    gen_random_uuid(),
    'MSN-GPS-MOCK',
    'Rastreo Avanzado Satelital',
    (SELECT id FROM auth.users WHERE email = 'lenovics73@gmail.com' LIMIT 1),
    'completada',
    'Sector Delta',
    '[
        {"t": 1709900000000, "lat": 10.485, "lng": -66.902},
        {"t": 1709900010000, "lat": 10.486, "lng": -66.904},
        {"t": 1709900020000, "lat": 10.488, "lng": -66.905},
        {"t": 1709900030000, "lat": 10.490, "lng": -66.903},
        {"t": 1709900040000, "lat": 10.492, "lng": -66.900}
    ]'::jsonb,
    now(),
    now()
);
