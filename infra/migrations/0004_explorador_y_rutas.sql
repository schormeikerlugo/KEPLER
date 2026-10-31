-- =============================================================================
-- KEPLER — estado del explorador e inteligencia de rutas
-- =============================================================================

-- Último cambio de calzado: el desgaste se cuenta desde aquí
alter table public.perfiles add column calzado_reset_en timestamptz;

-- `rutas.trazado` (PostGIS) se deriva de `waypoints` ([[lat, lng], ...])
create or replace function public.calcular_trazado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if jsonb_typeof(new.waypoints) = 'array' and jsonb_array_length(new.waypoints) >= 2 then
        select extensions.st_makeline(
                   array_agg(
                       extensions.st_setsrid(
                           extensions.st_makepoint((p ->> 1)::float8, (p ->> 0)::float8), 4326)
                       order by orden))::extensions.geography
          into new.trazado
          from jsonb_array_elements(new.waypoints) with ordinality as w (p, orden);
    else
        new.trazado := null;
    end if;
    return new;
end;
$$;

create trigger rutas_trazado
    before insert or update of waypoints on public.rutas
    for each row execute function public.calcular_trazado();
