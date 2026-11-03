-- 0008: perfil físico y rendimiento por misión.
--
-- `perfiles.fisico`: edad, peso, sexo, pulso máximo/reposo declarados
-- (kepler-core::fisiologia::PerfilFisico); lo que falte se estima.
-- `rendimiento_mision`: lo calcula kepler-server al completar la misión (y lo
-- recalcula si llega biometría más tarde); la valoración la pone el explorador.

alter table public.perfiles add column fisico jsonb not null default '{}';

create table public.rendimiento_mision (
    mision_id      uuid primary key references public.misiones (id) on delete cascade,
    user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
    -- Métricas calculadas (distancia, desnivel, pulso, zonas, SpO2, TRIMP, Preparación…)
    metricas       jsonb not null default '{}',
    -- Valoración del explorador al terminar
    esfuerzo       smallint check (esfuerzo between 1 and 10),
    sensacion      text check (char_length(sensacion) <= 40),
    notas          text check (char_length(notas) <= 1000),
    calculado_en   timestamptz not null default now(),
    valorado_en    timestamptz
);

create index rendimiento_mision_user_idx on public.rendimiento_mision (user_id, calculado_en desc);

alter table public.rendimiento_mision enable row level security;

create policy rendimiento_mision_propio on public.rendimiento_mision for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.rendimiento_mision to authenticated;
