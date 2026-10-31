#!/bin/sh
# Aplica migrations/*.sql y seed/*.sql pendientes, en orden, cada uno en su transacción.
# Registra lo aplicado en kepler_meta.migraciones.
#
# Uso (en cortex, dentro del directorio del stack, con el stack arriba):
#   sh scripts/migrate.sh

set -eu

cd "$(dirname "$0")/.."
. ./.env

psql_db() {
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" kepler-db \
        psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"
}

echo "Esperando a auth y storage (crean sus esquemas al arrancar)..."
for svc in kepler-auth kepler-storage; do
    i=0
    until [ "$(docker inspect -f '{{.State.Health.Status}}' "$svc" 2>/dev/null)" = "healthy" ]; do
        i=$((i + 1))
        [ "$i" -gt 60 ] && { echo "$svc no está healthy" >&2; exit 1; }
        sleep 2
    done
done

psql_db -c "create schema if not exists kepler_meta;
            create table if not exists kepler_meta.migraciones (
                archivo text primary key,
                aplicada_en timestamptz not null default now());"

for f in migrations/*.sql seed/*.sql; do
    [ -f "$f" ] || continue
    applied=$(psql_db -tA -c "select 1 from kepler_meta.migraciones where archivo = '$f'")
    if [ "$applied" = "1" ]; then
        continue
    fi
    echo "→ $f"
    { cat "$f"; echo; echo "insert into kepler_meta.migraciones (archivo) values ('$f');"; } \
        | psql_db --single-transaction
done

echo "Migraciones al día."
