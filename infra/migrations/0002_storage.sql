-- =============================================================================
-- KEPLER — Storage: buckets y permisos
--
-- Estructura de rutas: <bucket>/<user_id>/<...>
--   capturas/<user_id>/<entidad>/<id>.jpg   (privado)
--   avatares/<user_id>/<archivo>            (público, solo lectura)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('capturas', 'capturas', false, 20971520, array['image/jpeg', 'image/png', 'image/heic', 'image/webp']),
    ('avatares', 'avatares', true,  5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cada usuario opera solo dentro de su carpeta <user_id>/
create policy capturas_propias on storage.objects
    for all to authenticated
    using (bucket_id = 'capturas' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'capturas' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatares_propios on storage.objects
    for all to authenticated
    using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
