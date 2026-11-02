-- 0007: biometría del explorador.
--
-- Muestras de salud y sensores: las que el iPhone lee de Apple Salud (las que
-- escribe el reloj vía su app, el propio iPhone o el explorador), las del
-- barómetro del iPhone y, más adelante, las que llegan del reloj por Bluetooth.
-- El cliente da el id (el de la muestra de Salud cuando existe): reenviar es
-- seguro. Si la muestra cae dentro de una misión, se asocia a ella.

create table public.biometria (
    id         uuid primary key,
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    mision_id  uuid references public.misiones (id) on delete set null,
    -- pasos, distancia, energia_activa, pulso, pulso_reposo, vfc, spo2, sueno, animo, presion, altitud…
    tipo       text not null check (tipo ~ '^[a-z0-9_]{2,32}$'),
    valor      double precision not null,
    unidad     text not null,
    inicio     timestamptz not null,
    fin        timestamptz not null,
    -- App o dispositivo de origen («Carbinox Max», «iPhone de…», «reloj-ble»)
    fuente     text,
    -- Detalles por tipo (fase de sueño, etiquetas del estado de ánimo…)
    detalle    jsonb,
    creado_en  timestamptz not null default now(),
    check (fin >= inicio)
);

create index biometria_tipo_idx   on public.biometria (user_id, tipo, inicio desc);
create index biometria_mision_idx on public.biometria (mision_id) where mision_id is not null;

alter table public.biometria enable row level security;

create policy biometria_propio on public.biometria for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- Solo lectura, inserción y borrado (como el rastro GPS)
grant select, insert, delete on public.biometria to authenticated;
revoke update on public.biometria from authenticated;
