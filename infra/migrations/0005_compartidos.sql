-- =============================================================================
-- KEPLER — datos compartidos entre exploradores
--
-- Se comparte con todas las cuentas del servidor:
--   * puntos_interes: compartidos por defecto (asentamientos, peligros, zonas
--     de riesgo...). El autor puede marcarlos como privados.
--   * objetos: privados por defecto; el autor puede compartirlos.
--   * personas hostiles: alerta con descripción y foto (vista
--     alertas_personas), sin nombre, alias ni embedding.
-- Siempre privado: rutas, misiones, rastro GPS, notificaciones, chat, perfil.
-- Solo el autor edita o borra; los demás confirman o retiran (confirmaciones).
-- =============================================================================

alter table public.puntos_interes
    add column visibilidad text not null default 'compartido'
    check (visibilidad in ('privado', 'compartido'));

alter table public.objetos
    add column visibilidad text not null default 'privado'
    check (visibilidad in ('privado', 'compartido'));

-- Lectura de lo compartido (incluye borrados lógicos, para que la
-- sincronización propague la baja). Escribir sigue siendo solo del autor.
create policy puntos_interes_compartidos on public.puntos_interes
    for select to authenticated using (visibilidad = 'compartido');
create policy objetos_compartidos on public.objetos
    for select to authenticated using (visibilidad = 'compartido');

create index puntos_interes_compartidos_idx on public.puntos_interes (actualizado_en)
    where visibilidad = 'compartido';
create index objetos_compartidos_idx on public.objetos (actualizado_en)
    where visibilidad = 'compartido';
create index personas_hostiles_idx on public.personas (actualizado_en)
    where hostilidad = 'hostil';

-- -----------------------------------------------------------------------------
-- Vistas públicas (sin RLS: el dueño es el administrador). Solo exponen las
-- columnas seguras.
-- -----------------------------------------------------------------------------

-- Directorio para mostrar quién reportó qué
create view public.exploradores as
    select id, nombre_usuario, nombre_visible, avatar_path
    from public.perfiles;

create view public.alertas_personas as
    select p.id, p.user_id, e.nombre_usuario as autor,
           p.rasgos_fisicos, p.contexto, p.lat, p.lng, p.posicion, p.imagen_path,
           p.capturado_en, p.actualizado_en
    from public.personas p
    left join public.perfiles e on e.id = p.user_id
    where p.hostilidad = 'hostil' and p.eliminado_en is null;

revoke all on public.exploradores, public.alertas_personas from public, anon;
grant select on public.exploradores, public.alertas_personas to authenticated;

-- -----------------------------------------------------------------------------
-- ¿Es un reporte compartido? (para confirmaciones y fotos)
-- -----------------------------------------------------------------------------

create or replace function public.reporte_compartido(entidad text, registro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select case entidad
        when 'poi' then exists (
            select 1 from public.puntos_interes
            where id = registro and visibilidad = 'compartido' and eliminado_en is null)
        when 'persona' then exists (
            select 1 from public.personas
            where id = registro and hostilidad = 'hostil' and eliminado_en is null)
        else false
    end;
$$;

create or replace function public.imagen_compartida(ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.puntos_interes
                   where imagen_path = ruta and visibilidad = 'compartido' and eliminado_en is null)
        or exists (select 1 from public.objetos
                   where imagen_path = ruta and visibilidad = 'compartido' and eliminado_en is null)
        or exists (select 1 from public.personas
                   where imagen_path = ruta and hostilidad = 'hostil' and eliminado_en is null);
$$;

revoke execute on function public.reporte_compartido(text, uuid), public.imagen_compartida(text)
    from public, anon;
grant execute on function public.reporte_compartido(text, uuid), public.imagen_compartida(text)
    to authenticated;

-- Fotos de los reportes compartidos: cualquiera puede verlas, solo el autor cambiarlas
create policy capturas_compartidas on storage.objects
    for select to authenticated
    using (bucket_id = 'capturas' and public.imagen_compartida(name));

-- -----------------------------------------------------------------------------
-- Confirmaciones (solo inserción)
-- -----------------------------------------------------------------------------

create table public.confirmaciones (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
    entidad     text not null check (entidad in ('poi', 'persona')),
    registro_id uuid not null,
    tipo        text not null check (tipo in ('vigente', 'no_vigente')),
    creado_en   timestamptz not null default now()
);

create index confirmaciones_registro_idx on public.confirmaciones (entidad, registro_id, tipo, creado_en);
create index confirmaciones_sync_idx on public.confirmaciones (creado_en);

alter table public.confirmaciones enable row level security;

create policy confirmaciones_lectura on public.confirmaciones
    for select to authenticated using (true);
create policy confirmaciones_crear on public.confirmaciones
    for insert to authenticated
    with check (user_id = (select auth.uid()) and public.reporte_compartido(entidad, registro_id));

revoke update, delete on public.confirmaciones from authenticated;
