# infra

Stack Docker del proyecto compose **`kepler`**, desplegado en **cortex** (192.168.68.117) en `/home/cortex/services/kepler`.

Basado en el self-hosting oficial de Supabase, reducido a lo que usa KEPLER (sin edge functions, analytics ni pooler). FleetView enciende y apaga **todo el stack**; arranca bien aunque los contenedores se inicien en paralelo.

## Servicios

| Contenedor | Función | Puerto (cortex) |
|---|---|---|
| `kepler-server` | API REST + WebSocket en vivo (Rust), ver `services/README.md` | **8000** |
| `kepler-gateway` | Envoy: `/auth/v1`, `/rest/v1`, `/storage/v1`, `/realtime/v1` y Studio en `/` | **54321** |
| `kepler-db` | Postgres 17 + pgvector + PostGIS | **54322** (solo LAN) |
| `kepler-auth` | GoTrue (registro público desactivado) | interno |
| `kepler-rest` | PostgREST | interno |
| `kepler-realtime` | Realtime (cambios en vivo con RLS) | interno |
| `kepler-storage` + `kepler-imgproxy` | Archivos y miniaturas | interno |
| `kepler-meta` + `kepler-studio` | Administración (Studio pide usuario/contraseña) | vía gateway |
| `kepler-backup` | `pg_dump` diario a las 03:00, retención 14 días | — |

Consumo en reposo: ~860 MB de RAM (kepler-server: ~2 MB).

## Datos

| Qué | Dónde (cortex) |
|---|---|
| Base de datos | `~/services/kepler/volumes/db/data` (NVMe) |
| Archivos (Storage) | `/mnt/storage/kepler/storage` |
| Backups | `/mnt/storage/kepler/backups/kepler-AAAA-MM-DD.dump` |
| Secretos | `~/services/kepler/.env` (permisos 600, **nunca en git**) |

## Esquema

| Archivo | Contenido |
|---|---|
| `migrations/0001_init.sql` | Tablas, índices (sync, PostGIS, HNSW), RLS, `buscar_similares`, Realtime |
| `migrations/0002_storage.sql` | Buckets `capturas` (privado) y `avatares` (público), permisos por carpeta `<user_id>/` |
| `migrations/0003_usuarios.sql` | Cuentas por nombre de usuario (formato y perfil desde el email interno) |
| `seed/0001_catalogos.sql` | Taxonomía de objetos y categorías de POI |

Las migraciones aplicadas se registran en `kepler_meta.migraciones`. Para cambiar el esquema se añade un archivo nuevo numerado; nunca se edita uno ya aplicado.

## Operación

Desde la PC de desarrollo:

```bash
sh infra/scripts/deploy.sh              # construye kepler-server, lo envía, sincroniza, levanta y migra
sh infra/scripts/deploy.sh --sin-imagen # sin reconstruir kepler-server
sh infra/scripts/deploy.sh --sync       # solo sincroniza archivos
```

En cortex (`cd ~/services/kepler`):

```bash
sh scripts/gen-env.sh                          # primera vez: genera .env con secretos nuevos
sh scripts/migrate.sh                          # aplica migraciones pendientes
sh scripts/create-user.sh <usuario> [nombre]   # crea una cuenta (pide contraseña)
sh scripts/set-password.sh <usuario>           # cambia la contraseña
docker compose ps                              # estado
docker compose logs -f <servicio>              # logs
```

Restaurar un backup:

```bash
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" kepler-db \
  pg_restore -h localhost -U supabase_admin -d postgres --clean --if-exists < /mnt/storage/kepler/backups/kepler-AAAA-MM-DD.dump
```

## Cuentas

Se inicia sesión con **nombre de usuario** (3-30 caracteres: minúsculas, números y `_`). Auth necesita un email, así que internamente se usa `<usuario>@kepler.local`; las apps lo construyen solas y nunca se muestra. No hay recuperación por correo: la contraseña se cambia con `set-password.sh`.

## Notas

- La primera suscripción Realtime tras arrancar el stack tarda unos segundos (crea el slot de replicación).
- La imagen de `kepler-server` se construye en la PC (Docker) y se envía con `docker save | ssh cortex docker load`. Con `docker-buildx` instalado se podría cachear la compilación.
- `deploy.sh` usa `rsync` si está instalado; si no, copia con `tar` (sin borrar en destino archivos eliminados del repo).
