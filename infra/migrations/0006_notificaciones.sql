-- 0006: bitácora generada por la base de datos.
--
-- Los eventos que importan quedan en `notificaciones` sin depender de qué app
-- los provocó ni de si llegaron en línea o por sincronización offline:
--   * misión iniciada / completada / abortada → al explorador;
--   * peligro compartido nuevo (POI alto/crítico o persona hostil) → a todos los demás.
-- Las de Re-ID las escribe kepler-server al procesar capturas.

create or replace function public.riesgo_legible(nivel text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case nivel when 'critico' then 'crítico' else nivel end;
$$;

-- -----------------------------------------------------------------------------
-- Misiones
-- -----------------------------------------------------------------------------

create or replace function public.notificar_mision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    nombre   text := coalesce(nullif(new.titulo, ''), new.codigo);
    contexto jsonb := jsonb_build_object(
        'origen', 'mision', 'mision_id', new.id, 'codigo', new.codigo, 'estado', new.estado);
begin
    if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
        return null;
    end if;
    case new.estado
        when 'activa' then
            insert into public.notificaciones (user_id, tipo, mensaje, contexto)
            values (new.user_id, 'info', format('🚀 Misión «%s» iniciada', nombre), contexto);
        when 'completada' then
            insert into public.notificaciones (user_id, tipo, mensaje, contexto)
            values (new.user_id, 'success',
                    format('✅ Misión «%s» completada · %s km en %s min', nombre,
                           round((new.distancia_m / 1000)::numeric, 1),
                           round(new.duracion_s / 60.0)),
                    contexto);
        when 'abortada' then
            insert into public.notificaciones (user_id, tipo, mensaje, contexto)
            values (new.user_id, 'warning', format('⛔ Misión «%s» abortada', nombre), contexto);
        else
            null;
    end case;
    return null;
end;
$$;

create trigger misiones_notificar
    after insert or update of estado on public.misiones
    for each row execute function public.notificar_mision();

-- -----------------------------------------------------------------------------
-- Peligros compartidos: aviso a todos los demás exploradores
-- -----------------------------------------------------------------------------

create or replace function public.notificar_peligro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    autor    text;
    tipo     text;
    mensaje  text;
    entidad  text;
begin
    if tg_table_name = 'puntos_interes' then
        if not (new.visibilidad = 'compartido' and new.nivel_riesgo in ('alto', 'critico')
                and new.estado <> 'inactivo' and new.eliminado_en is null) then
            return null;
        end if;
        if tg_op = 'UPDATE' and old.visibilidad = 'compartido'
           and old.nivel_riesgo in ('alto', 'critico') and old.estado <> 'inactivo'
           and old.eliminado_en is null then
            return null; -- ya era un peligro: ya se avisó
        end if;
        entidad := 'poi';
        tipo := case new.nivel_riesgo when 'critico' then 'critical' else 'warning' end;
    else
        if not (new.hostilidad = 'hostil' and new.eliminado_en is null) then
            return null;
        end if;
        if tg_op = 'UPDATE' and old.hostilidad = 'hostil' and old.eliminado_en is null then
            return null;
        end if;
        entidad := 'persona';
        tipo := 'critical';
    end if;

    select nombre_usuario into autor from public.perfiles where id = new.user_id;
    if entidad = 'poi' then
        mensaje := format('⚠️ @%s reportó un peligro: «%s» (riesgo %s)',
                          autor, new.nombre, public.riesgo_legible(new.nivel_riesgo));
    else
        -- De una persona no se comparte el nombre
        mensaje := format('🚨 @%s reportó una persona hostil%s',
                          autor, coalesce(': ' || nullif(new.rasgos_fisicos, ''), ''));
    end if;

    insert into public.notificaciones (user_id, tipo, mensaje, contexto)
    select p.id, tipo, mensaje,
           jsonb_build_object('origen', 'reporte_compartido', 'entidad', entidad,
                              'id', new.id, 'lat', new.lat, 'lng', new.lng, 'autor', autor)
    from public.perfiles p
    where p.id <> new.user_id;
    return null;
end;
$$;

create trigger puntos_interes_notificar
    after insert or update of visibilidad, nivel_riesgo, estado, eliminado_en on public.puntos_interes
    for each row execute function public.notificar_peligro();
create trigger personas_notificar
    after insert or update of hostilidad, eliminado_en on public.personas
    for each row execute function public.notificar_peligro();

revoke execute on function public.notificar_mision(), public.notificar_peligro()
    from public, anon, authenticated;

-- Bitácora: listar por fecha y contar no leídas
create index notificaciones_lista_idx on public.notificaciones (user_id, creado_en desc)
    where eliminado_en is null;
