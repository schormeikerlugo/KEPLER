-- =============================================================================
-- KEPLER — cuentas por nombre de usuario
--
-- Se inicia sesión con un nombre de usuario. Auth (GoTrue) necesita un email,
-- así que se usa uno interno: <usuario>@kepler.local (no recibe correos).
-- =============================================================================

alter table public.perfiles
    drop constraint if exists perfiles_nombre_usuario_check;

alter table public.perfiles
    add constraint perfiles_nombre_usuario_formato
    check (nombre_usuario ~ '^[a-z0-9_]{3,30}$');

alter table public.perfiles
    alter column nombre_usuario set not null;

-- El perfil toma el usuario del email interno si no viene en los metadatos
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    usuario text := coalesce(
        new.raw_user_meta_data ->> 'nombre_usuario',
        split_part(new.email, '@', 1)
    );
begin
    insert into public.perfiles (id, nombre_usuario, nombre_visible)
    values (
        new.id,
        usuario,
        coalesce(new.raw_user_meta_data ->> 'nombre_visible', usuario)
    );
    return new;
end;
$$;
