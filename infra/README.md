# infra

Stack Docker del proyecto compose `kepler`, desplegado en **cortex** (192.168.68.117).

FleetView enciende y apaga **todo el stack**. Todos los contenedores usan el prefijo `kepler-`.

Contenido previsto (paso 2 del roadmap):

- `docker-compose.yml` — Supabase (db con pgvector, auth, rest, realtime, storage, kong, meta, studio) + `kepler-server`
- `migrations/` — esquema limpio (`0001_init.sql`) y seeds
- `backup/` — `pg_dump` diario a `/mnt/storage/kepler/backups`
