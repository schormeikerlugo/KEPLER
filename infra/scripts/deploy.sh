#!/bin/sh
# Sincroniza infra/ con cortex (sin secretos ni datos) y levanta el stack.
#
# Uso (desde la PC de desarrollo):
#   sh infra/scripts/deploy.sh            # sync + up -d + migraciones
#   sh infra/scripts/deploy.sh --sync     # solo sincronizar archivos

set -eu

HOST="${KEPLER_HOST:-cortex}"
DIR="${KEPLER_DIR:-/home/cortex/services/kepler}"

cd "$(dirname "$0")/.."

if command -v rsync >/dev/null 2>&1; then
    rsync -az --delete \
        --exclude '.env' \
        --exclude 'volumes/db/data/' \
        --exclude 'volumes/storage/' \
        --exclude 'volumes/backups/' \
        ./ "${HOST}:${DIR}/"
else
    # Sin rsync: copia con tar (no elimina en el destino archivos borrados aquí)
    tar czf - \
        --exclude './.env' \
        --exclude './volumes/db/data' \
        --exclude './volumes/storage' \
        --exclude './volumes/backups' \
        . | ssh "$HOST" "mkdir -p '$DIR' && tar xzf - -C '$DIR'"
fi

echo "Sincronizado en ${HOST}:${DIR}"
[ "${1:-}" = "--sync" ] && exit 0

ssh "$HOST" "cd '$DIR' && docker compose up -d && sh scripts/migrate.sh"
