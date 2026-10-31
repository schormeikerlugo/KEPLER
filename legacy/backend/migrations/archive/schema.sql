-- 🌌 MARS-SIGHT AR DATABASE SCHEMA
-- Autor: Antigravity Agent
-- Version: 1.0.0

-- 1. EXTENSIONES
-- Habilitar PostGIS para datos geográficos (crucial para AR y mapas)
create extension if not exists postgis;
create extension if not exists vector; -- Para IA (Embeddings)

-- 2. TABLA DE PERFILES (Profiles)
-- Extiende la tabla auth.users de Supabase
create table public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  username text,
  full_name text,
  avatar_url text,
  role text default 'astronaut' check (role in ('commander', 'astronaut', 'analyst')),
  clearance_level int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  primary key (id),
  constraint username_length check (char_length(username) >= 3)
);

-- Habilitar Row Level Security (RLS)
alter table public.profiles enable row level security;

-- Políticas de Seguridad para Profiles
create policy "Perfiles públicos son visibles por todos"
  on public.profiles for select
  using ( true );

create policy "Usuarios pueden editar su propio perfil"
  on public.profiles for update
  using ( auth.uid() = id );

create policy "Usuarios pueden insertar su propio perfil"
  on public.profiles for insert
  with check ( auth.uid() = id );

-- 3. TABLA DE MISIONES (Missions)
create table public.missions (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  status text default 'planning' check (status in ('planning', 'active', 'completed', 'aborted')),
  location_name text,
  commander_id uuid references public.profiles(id),
  start_date timestamptz,
  created_at timestamptz default now()
);

alter table public.missions enable row level security;

create policy "Misiones visibles para usuarios autenticados"
  on public.missions for select
  using ( auth.role() = 'authenticated' );

-- 4. PUNTOS DE INTERÉS (POIs) - Datos GIS
create table public.pois (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text not null check (type in ('mineral', 'hazard', 'base', 'artifact', 'water')),
  description text,
  
  -- Coordenadas geográficas (Longitud, Latitud) en Marte (o Tierra simulada)
  -- Usamos Geometry(Point, 4326) para estándar GPS
  location geometry(Point, 4326) not null,
  
  altitude float default 0.0,
  detected_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Índice espacial para búsquedas rápidas por ubicación
create index pois_location_idx on public.pois using GIST (location);

alter table public.pois enable row level security;

create policy "POIs visibles para todos los astronautas"
  on public.pois for select
  using ( auth.role() = 'authenticated' );

create policy "Astronautas pueden registrar POIs"
  on public.pois for insert
  with check ( auth.role() = 'authenticated' );

-- 5. AUTOMATIZACIÓN (Triggers)
-- Función para crear perfil automáticamente al registrarse un usuario
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'astronaut_' || substr(new.id::text, 1, 6)),
    COALESCE(new.raw_user_meta_data->>'full_name', 'Astronauta Anónimo'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger que dispara la función
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- DATOS DE SEMILLA (Opcional, descomentar si se desea insertar datos iniciales manualmente)
-- insert into public.missions (title, description, status, location_name)
-- values ('Exploración Alpha', 'Primer reconocimiento del cráter Gale', 'active', 'Gale Crater');
