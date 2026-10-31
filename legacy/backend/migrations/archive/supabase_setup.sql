-- 1. Habilitar extensiones (PostGIS para mapa, pgvector para IA)
create extension if not exists postgis;
create extension if not exists pgvector;

-- 2. Crear Tabla de Objetos
-- Eliminamos la anterior si existía para evitar conflictos
drop table if exists objetos_exploracion;

create table objetos_exploracion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id), -- Importante: Saber quién lo creó
  nombre text,
  descripcion text,
  tipo text, -- 'base', 'hazard', 'resource'
  
  -- Posición Exacta (GPS)
  posicion geography(Point, 4326), 
  
  -- Vector IA (Para futuro reconocimiento visual)
  embedding vector(1024), 
  
  -- Metadata extra (Altura detectada, rotación, etc.)
  metadata jsonb, 
  
  created_at timestamp with time zone default now()
);

-- 3. Índices para velocidad extrema
create index objetos_geo_idx on objetos_exploracion using gist (posicion);

-- 4. Seguridad (RLS)
alter table objetos_exploracion enable row level security;

-- Todos ven todo (Filosofía Death Stranding)
create policy "Ver objetos mundiales" 
on objetos_exploracion for select 
using (true);

-- Autenticados crean
create policy "Crear objetos" 
on objetos_exploracion for insert 
with check (auth.uid() = user_id);

-- 5. Función RPC para buscar por cercanía
-- Esta función se llama desde JS: supabase.rpc('buscar_objetos_cercanos', { ... })
create or replace function buscar_objetos_cercanos (
  lat float,
  lon float,
  radio_metros float
)
returns setof objetos_exploracion
language sql
as $$
  select *
  from objetos_exploracion
  where st_dwithin(
    posicion,
    st_setsrid(st_makepoint(lon, lat), 4326)::geography,
    radio_metros
  )
  -- Ordenar por distancia (los más cercanos primero)
  order by posicion <-> st_setsrid(st_makepoint(lon, lat), 4326)::geography;
$$;
