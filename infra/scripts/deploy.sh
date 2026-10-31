#!/bin/sh
# Despliega el stack kepler en cortex.
#
# Uso (desde la PC de desarrollo, en cualquier directorio):
#   sh infra/scripts/deploy.sh              # imagen del servidor + sync + up -d + migraciones
#   sh infra/scripts/deploy.sh --sin-imagen # sin reconstruir kepler-server
#   sh infra/scripts/deploy.sh --sync       # solo sincronizar archivos de infra

set -eu

HOST="${KEPLER_HOST:-cortex}"
DIR="${KEPLER_DIR:-/home/cortex/services/kepler}"
MODO="${1:-}"

INFRA="$(cd "$(dirname "$0")/.." && pwd)"
RAIZ="$(cd "$INFRA/.." && pwd)"

if [ "$MODO" = "" ]; then
    echo "→ Construyendo kepler-server"
    docker build -q -f "$RAIZ/services/kepler-server/Dockerfile" -t kepler-server:latest "$RAIZ" >/dev/null
    echo "→ Enviando imagen a ${HOST}"
    docker save kepler-server:latest | gzip -1 | ssh "$HOST" 'gunzip | docker load -q'
fi

cd "$INFRA"
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
echo "→ Sincronizado en ${HOST}:${DIR}"
[ "$MODO" = "--sync" ] && exit 0

ssh "$HOST" "cd '$DIR' && docker compose up -d --remove-orphans && sh scripts/migrate.sh"
