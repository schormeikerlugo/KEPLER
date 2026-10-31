-- =============================================================================
-- KEPLER v0.8 — esquema inicial (base limpia)
--
-- Convenciones:
--   * Nombres en español, snake_case.
--   * UUID generados por el cliente (offline-first); default solo como respaldo.
--   * Tablas sincronizables: creado_en, actualizado_en, eliminado_en (borrado
--     lógico) y version (se incrementa en cada UPDATE).
--   * Coordenadas como lat/lng; `posicion` (PostGIS) se genera sola para
--     consultas espaciales.
--   * Imágenes: ruta dentro de Storage (`imagen_path`), nunca base64 ni URL.
--   * RLS: cada explorador solo ve y modifica lo suyo.
-- =============================================================================

create extension if not exists vector with schema extensions;
create extension if not exists postgis with schema extensions;

-- -----------------------------------------------------------------------------
-- Funciones comunes
-- -----------------------------------------------------------------------------

create or replace function public.tocar_registro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.actualizado_en := now();
    new.version := old.version + 1;
    return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfiles
-- -----------------------------------------------------------------------------

create table public.perfiles (
    id               uuid primary key references auth.users (id) on delete cascade,
    nombre_usuario   text unique check (char_length(nombre_usuario) between 3 and 50),
    nombre_visible   text,
    avatar_path      text,
    avatar_ia        text,
    bio              text,
    rol              text not null default 'explorador'
                     check (rol in ('explorador', 'comandante')),
    ubicacion        text,
    preferencias     jsonb not null default '{}',
    creado_en        timestamptz not null default now(),
    actualizado_en   timestamptz not null default now(),
    version          bigint not null default 1
);

create trigger perfiles_tocar before update on public.perfiles
    for each row execute function public.tocar_registro();

-- Crea el perfil al registrar un usuario en auth
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.perfiles (id, nombre_usuario, nombre_visible)
    values (
        new.id,
        new.raw_user_meta_data ->> 'nombre_usuario',
        coalesce(new.raw_user_meta_data ->> 'nombre_visible',
                 new.raw_user_meta_data ->> 'nombre_usuario')
    );
    return new;
end;
$$;

create trigger al_crear_usuario after insert on auth.users
    for each row execute function public.crear_perfil();

-- -----------------------------------------------------------------------------
-- Catálogos globales (lectura para todos, escritura solo service_role)
-- -----------------------------------------------------------------------------

create table public.categorias (
    id          uuid primary key default gen_random_uuid(),
    nombre      text not null unique,
    descripcion text,
    color       text not null default '#3FA8FF',
    icono       text not null default 'folder',
    orden       integer not null default 0,
    creado_en   timestamptz not null default now()
);

create table public.subcategorias (
    id           uuid primary key default gen_random_uuid(),
    categoria_id uuid not null references public.categorias (id) on delete cascade,
    nombre       text not null,
    descripcion  text,
    creado_en    timestamptz not null default now(),
    unique (categoria_id, nombre)
);

create table public.poi_categorias (
    id        uuid primary key default gen_random_uuid(),
    clave     text not null unique,
    nombre    text not null,
    color     text not null default '#3FA8FF',
    icono     text not null default 'pin',
    orden     integer not null default 0,
    creado_en timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Rutas (planificadas y registradas en campo, antes dos tablas)
-- -----------------------------------------------------------------------------

create table public.rutas (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
    origen         text not null default 'planificada'
                   check (origen in ('planificada', 'registrada')),
    nombre         text not null,
    destino        text,
    tipo_terreno   text check (tipo_terreno in ('llano', 'asfalto', 'tierra', 'barro', 'rocoso', 'montana')),
    dificultad     text check (dificultad in ('baja', 'moderada', 'alta')),
    seguridad      text not null default 'desconocido'
                   check (seguridad in ('seguro', 'precaucion', 'peligro', 'desconocido')),
    distancia_km   double precision check (distancia_km >= 0),
    -- [[lat, lng], ...]
    waypoints      jsonb not null default '[]',
    trazado        extensions.geography(linestring, 4326),
    notas          text,
    imagen_path    text,
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    eliminado_en   timestamptz,
    version        bigint not null default 1
);

-- -----------------------------------------------------------------------------
-- Misiones
-- -----------------------------------------------------------------------------

create table public.misiones (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
    ruta_id        uuid references public.rutas (id) on delete set null,
    codigo         text not null,
    titulo         text,
    objetivo       text,
    estado         text not null default 'planificada'
                   check (estado in ('planificada', 'activa', 'completada', 'abortada')),
    zona           text,
    descripcion_ia text,
    tipo_terreno   text check (tipo_terreno in ('llano', 'asfalto', 'tierra', 'barro', 'rocoso', 'montana')),
    dificultad     text check (dificultad in ('baja', 'moderada', 'alta')),
    clima          jsonb not null default '{}',
    lat_inicio     double precision check (lat_inicio between -90 and 90),
    lng_inicio     double precision check (lng_inicio between -180 and 180),
    inicio_en      timestamptz,
    fin_en         timestamptz,
    -- Resumen del rastro GPS, calculado al cerrar la misión
    distancia_m    double precision not null default 0,
    duracion_s     integer not null default 0,
    vel_max_mps    double precision not null default 0,
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    eliminado_en   timestamptz,
    version        bigint not null default 1,
    unique (user_id, codigo),
    check (fin_en is null or inicio_en is null or fin_en >= inicio_en)
);

-- Rastro GPS: solo inserción (no se edita ni se borra lógicamente)
create table public.rastro_gps (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
    mision_id    uuid not null references public.misiones (id) on delete cascade,
    lat          double precision not null check (lat between -90 and 90),
    lng          double precision not null check (lng between -180 and 180),
    altitud      double precision,
    velocidad    double precision,
    rumbo        double precision,
    precision_m  double precision,
    registrado_en timestamptz not null,
    creado_en    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Hallazgos: objetos, personas y puntos de interés
-- -----------------------------------------------------------------------------

create table public.objetos (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
    mision_id          uuid references public.misiones (id) on delete set null,
    categoria_id       uuid references public.categorias (id) on delete set null,
    subcategoria_id    uuid references public.subcategorias (id) on delete set null,
    nombre             text not null,
    clase_yolo         text,
    confianza          real check (confianza between 0 and 1),
    descripcion        text,
    descripcion_ia     text,
    lat                double precision check (lat between -90 and 90),
    lng                double precision check (lng between -180 and 180),
    distancia_m        real,
    posicion           extensions.geography(point, 4326) generated always as (
                           case when lat is not null and lng is not null
                           then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
                           end) stored,
    imagen_path        text,
    embedding          extensions.vector(512),
    atributos          jsonb not null default '{}',
    contexto_ambiental jsonb not null default '{}',
    capturado_en       timestamptz not null default now(),
    creado_en          timestamptz not null default now(),
    actualizado_en     timestamptz not null default now(),
    eliminado_en       timestamptz,
    version            bigint not null default 1
);

create table public.etiquetas (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
    nombre    text not null,
    color     text not null default '#2ecc71',
    creado_en timestamptz not null default now(),
    unique (user_id, nombre)
);

create table public.objeto_etiquetas (
    objeto_id   uuid not null references public.objetos (id) on delete cascade,
    etiqueta_id uuid not null references public.etiquetas (id) on delete cascade,
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    primary key (objeto_id, etiqueta_id)
);

create table public.personas (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
    mision_id       uuid references public.misiones (id) on delete set null,
    -- Avistamiento vinculado a una identidad ya conocida (comparador / Re-ID)
    identidad_id    uuid references public.personas (id) on delete set null,
    nombre          text not null,
    alias           text,
    contexto        text,
    hostilidad      text not null default 'desconocido'
                    check (hostilidad in ('aliado', 'neutral', 'hostil', 'desconocido')),
    rasgos_fisicos  text,
    notas           text,
    confianza       real check (confianza between 0 and 1),
    lat             double precision check (lat between -90 and 90),
    lng             double precision check (lng between -180 and 180),
    posicion        extensions.geography(point, 4326) generated always as (
                        case when lat is not null and lng is not null
                        then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
                        end) stored,
    imagen_path     text,
    embedding       extensions.vector(512),
    capturado_en    timestamptz not null default now(),
    creado_en       timestamptz not null default now(),
    actualizado_en  timestamptz not null default now(),
    eliminado_en    timestamptz,
    version         bigint not null default 1,
    check (identidad_id is null or identidad_id <> id)
);

create table public.puntos_interes (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
    mision_id      uuid references public.misiones (id) on delete set null,
    categoria_id   uuid references public.poi_categorias (id) on delete set null,
    nombre         text not null,
    descripcion    text,
    zona           text,
    nivel_riesgo   text not null default 'medio'
                   check (nivel_riesgo in ('bajo', 'medio', 'alto', 'critico')),
    estado         text not null default 'activo'
                   check (estado in ('activo', 'verificado', 'inactivo')),
    clase_yolo     text,
    lat            double precision check (lat between -90 and 90),
    lng            double precision check (lng between -180 and 180),
    posicion       extensions.geography(point, 4326) generated always as (
                       case when lat is not null and lng is not null
                       then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
                       end) stored,
    imagen_path    text,
    embedding      extensions.vector(512),
    metadata       jsonb not null default '{}',
    capturado_en   timestamptz not null default now(),
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    eliminado_en   timestamptz,
    version        bigint not null default 1
);

-- -----------------------------------------------------------------------------
-- Notificaciones y chat
-- -----------------------------------------------------------------------------

create table public.notificaciones (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
    mensaje        text not null,
    tipo           text not null default 'info'
                   check (tipo in ('critical', 'warning', 'success', 'info')),
    leida          boolean not null default false,
    contexto       jsonb,
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    eliminado_en   timestamptz,
    version        bigint not null default 1
);

create table public.chat_sesiones (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
    titulo         text,
    -- [{ "rol": "user|assistant", "contenido": "...", "en": "<timestamp>" }, ...]
    mensajes       jsonb not null default '[]',
    creado_en      timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    eliminado_en   timestamptz,
    version        bigint not null default 1
);

-- -----------------------------------------------------------------------------
-- Triggers de versión
-- -----------------------------------------------------------------------------

create trigger rutas_tocar before update on public.rutas
    for each row execute function public.tocar_registro();
create trigger misiones_tocar before update on public.misiones
    for each row execute function public.tocar_registro();
create trigger objetos_tocar before update on public.objetos
    for each row execute function public.tocar_registro();
create trigger personas_tocar before update on public.personas
    for each row execute function public.tocar_registro();
create trigger puntos_interes_tocar before update on public.puntos_interes
    for each row execute function public.tocar_registro();
create trigger notificaciones_tocar before update on public.notificaciones
    for each row execute function public.tocar_registro();
create trigger chat_sesiones_tocar before update on public.chat_sesiones
    for each row execute function public.tocar_registro();

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------

-- Sincronización incremental: "dame lo cambiado desde X"
create index rutas_sync_idx          on public.rutas          (user_id, actualizado_en);
create index misiones_sync_idx       on public.misiones       (user_id, actualizado_en);
create index objetos_sync_idx        on public.objetos        (user_id, actualizado_en);
create index personas_sync_idx       on public.personas       (user_id, actualizado_en);
create index puntos_interes_sync_idx on public.puntos_interes (user_id, actualizado_en);
create index notificaciones_sync_idx on public.notificaciones (user_id, actualizado_en);
create index chat_sesiones_sync_idx  on public.chat_sesiones  (user_id, actualizado_en);
create index rastro_gps_sync_idx     on public.rastro_gps     (user_id, creado_en);

-- Relaciones
create index rastro_gps_mision_idx     on public.rastro_gps     (mision_id, registrado_en);
create index objetos_mision_idx        on public.objetos        (mision_id);
create index personas_mision_idx       on public.personas       (mision_id);
create index personas_identidad_idx    on public.personas       (identidad_id);
create index puntos_interes_mision_idx on public.puntos_interes (mision_id);
create index misiones_ruta_idx         on public.misiones       (ruta_id);
create index misiones_estado_idx       on public.misiones       (user_id, estado);
create index subcategorias_cat_idx     on public.subcategorias  (categoria_id);

-- Espaciales
create index objetos_posicion_idx        on public.objetos        using gist (posicion);
create index personas_posicion_idx       on public.personas       using gist (posicion);
create index puntos_interes_posicion_idx on public.puntos_interes using gist (posicion);
create index rutas_trazado_idx           on public.rutas          using gist (trazado);

-- Re-ID visual (similitud de coseno)
create index objetos_embedding_idx        on public.objetos        using hnsw (embedding extensions.vector_cosine_ops);
create index personas_embedding_idx       on public.personas       using hnsw (embedding extensions.vector_cosine_ops);
create index puntos_interes_embedding_idx on public.puntos_interes using hnsw (embedding extensions.vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- Re-ID: buscar coincidencias visuales del propio usuario
-- -----------------------------------------------------------------------------

create or replace function public.buscar_similares(
    entidad    text,
    consulta   extensions.vector(512),
    umbral     double precision default 0.78,
    limite     integer default 5
)
returns table (id uuid, nombre text, similitud double precision)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
    if entidad = 'persona' then
        return query
            select p.id, p.nombre, 1 - (p.embedding <=> consulta)
            from personas p
            where p.embedding is not null and p.eliminado_en is null
              and 1 - (p.embedding <=> consulta) >= umbral
            order by p.embedding <=> consulta
            limit limite;
    elsif entidad = 'poi' then
        return query
            select p.id, p.nombre, 1 - (p.embedding <=> consulta)
            from puntos_interes p
            where p.embedding is not null and p.eliminado_en is null
              and 1 - (p.embedding <=> consulta) >= umbral
            order by p.embedding <=> consulta
            limit limite;
    elsif entidad = 'objeto' then
        return query
            select o.id, o.nombre, 1 - (o.embedding <=> consulta)
            from objetos o
            where o.embedding is not null and o.eliminado_en is null
              and 1 - (o.embedding <=> consulta) >= umbral
            order by o.embedding <=> consulta
            limit limite;
    else
        raise exception 'entidad desconocida: % (persona | poi | objeto)', entidad;
    end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seguridad (RLS)
-- -----------------------------------------------------------------------------

alter table public.perfiles         enable row level security;
alter table public.categorias       enable row level security;
alter table public.subcategorias    enable row level security;
alter table public.poi_categorias   enable row level security;
alter table public.rutas            enable row level security;
alter table public.misiones         enable row level security;
alter table public.rastro_gps       enable row level security;
alter table public.objetos          enable row level security;
alter table public.etiquetas        enable row level security;
alter table public.objeto_etiquetas enable row level security;
alter table public.personas         enable row level security;
alter table public.puntos_interes   enable row level security;
alter table public.notificaciones   enable row level security;
alter table public.chat_sesiones    enable row level security;

-- Perfil: cada uno ve y edita el suyo (se crea por trigger)
create policy perfiles_propio_select on public.perfiles
    for select to authenticated using (id = (select auth.uid()));
create policy perfiles_propio_update on public.perfiles
    for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Catálogos: solo lectura
create policy categorias_lectura     on public.categorias     for select to authenticated using (true);
create policy subcategorias_lectura  on public.subcategorias  for select to authenticated using (true);
create policy poi_categorias_lectura on public.poi_categorias for select to authenticated using (true);

-- Datos del explorador: todo lo propio
do $$
declare
    t text;
begin
    foreach t in array array[
        'rutas', 'misiones', 'rastro_gps', 'objetos', 'etiquetas', 'objeto_etiquetas',
        'personas', 'puntos_interes', 'notificaciones', 'chat_sesiones'
    ] loop
        execute format(
            'create policy %I on public.%I for all to authenticated
                 using (user_id = (select auth.uid()))
                 with check (user_id = (select auth.uid()))',
            t || '_propio', t);
    end loop;
end;
$$;

-- El rastro GPS es solo inserción
revoke update on public.rastro_gps from authenticated;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

alter publication supabase_realtime add table
    public.misiones,
    public.objetos,
    public.personas,
    public.puntos_interes,
    public.rutas,
    public.notificaciones;
