-- =============================================================================
-- KEPLER — catálogos iniciales (taxonomía de objetos y categorías de POI)
-- Tomados de la v0.7; se añade "Geología".
-- =============================================================================

insert into public.categorias (nombre, descripcion, color, icono, orden) values
    ('Personas',           'Individuos y grupos de personas',   '#3498db', 'user',           1),
    ('Animales',           'Fauna doméstica y salvaje',         '#27ae60', 'paw',            2),
    ('Vehículos',          'Medios de transporte',              '#e74c3c', 'car',            3),
    ('Lugares',            'Ubicaciones y espacios',            '#9b59b6', 'map-pin',        4),
    ('Mobiliario',         'Muebles y equipamiento',            '#f39c12', 'home',           5),
    ('Tecnología',         'Dispositivos electrónicos',         '#1abc9c', 'smartphone',     6),
    ('Alimentos',          'Comida y bebidas',                  '#e67e22', 'coffee',         7),
    ('Señales',            'Indicadores y advertencias',        '#c0392b', 'alert-triangle', 8),
    ('Objetos Personales', 'Pertenencias y accesorios',         '#8e44ad', 'briefcase',      9),
    ('Naturaleza',         'Flora y elementos naturales',       '#16a085', 'leaf',          10),
    ('Infraestructura',    'Construcciones y estructuras',      '#7f8c8d', 'building',      11),
    ('Geología',           'Rocas, minerales y formaciones',    '#b8860b', 'mountain',      12),
    ('Sin Clasificar',     'Objetos pendientes de categorizar', '#95a5a6', 'help-circle',   99)
on conflict (nombre) do nothing;

insert into public.subcategorias (categoria_id, nombre, descripcion)
select c.id, s.nombre, s.descripcion
from (values
    ('Personas',  'Familia',            'Miembros de la familia'),
    ('Personas',  'Amigos',             'Amigos y conocidos cercanos'),
    ('Personas',  'Compañeros',         'Colegas de trabajo o estudio'),
    ('Personas',  'Desconocidos',       'Personas no identificadas'),
    ('Animales',  'Mascotas',           'Animales domésticos'),
    ('Animales',  'Salvajes',           'Animales en libertad'),
    ('Animales',  'Aves',               'Pájaros y aves'),
    ('Animales',  'Insectos',           'Insectos y arácnidos'),
    ('Vehículos', 'Automóviles',        'Autos y camionetas'),
    ('Vehículos', 'Motocicletas',       'Motos y scooters'),
    ('Vehículos', 'Bicicletas',         'Bicicletas y similares'),
    ('Vehículos', 'Transporte Público', 'Buses, metros, taxis'),
    ('Lugares',   'Hogar',              'Casa y residencia'),
    ('Lugares',   'Trabajo',            'Oficina y lugar de trabajo'),
    ('Lugares',   'Comercios',          'Tiendas y locales'),
    ('Lugares',   'Espacios Públicos',  'Parques, plazas, calles'),
    ('Geología',  'Rocas',              'Rocas ígneas, sedimentarias y metamórficas'),
    ('Geología',  'Minerales',          'Cristales y minerales identificables'),
    ('Geología',  'Formaciones',        'Estratos, cuevas, afloramientos')
) as s (categoria, nombre, descripcion)
join public.categorias c on c.nombre = s.categoria
on conflict (categoria_id, nombre) do nothing;

insert into public.poi_categorias (clave, nombre, color, icono, orden) values
    ('salud',    'Centros de salud',    '#ff4444', 'cross',      1),
    ('descanso', 'Puntos de descanso',  '#00d4aa', 'tent',       2),
    ('muestra',  'Sitios de muestra',   '#3fa8ff', 'microscope', 3),
    ('peligro',  'Sitios peligrosos',   '#ffbb33', 'warning',    4)
on conflict (clave) do nothing;
