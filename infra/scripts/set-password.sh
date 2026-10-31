#!/bin/sh
# Cambia la contraseña de una cuenta (no hay recuperación por correo).
#
# Uso (en cortex, dentro del directorio del stack):
#   sh scripts/set-password.sh <usuario>
# La contraseña se pide por teclado (o se lee de KEPLER_PASSWORD).

set -eu

cd "$(dirname "$0")/.."
. ./.env

usuario="${1:?Uso: set-password.sh <usuario>}"
API="http://localhost:${KEPLER_API_PORT:-54321}"
AUTH="Authorization: Bearer ${SERVICE_ROLE_KEY}"

id=$(docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" kepler-db \
    psql -h localhost -U supabase_admin -d postgres -tA \
    -c "select id from public.perfiles where nombre_usuario = '${usuario}'")

[ -n "$id" ] || { echo "No existe la cuenta '${usuario}'" >&2; exit 1; }

pass="${KEPLER_PASSWORD:-}"
if [ -z "$pass" ]; then
    printf "Nueva contraseña para %s: " "$usuario"
    stty -echo; read -r pass; stty echo; echo
fi
[ "${#pass}" -ge 8 ] || { echo "Mínimo 8 caracteres" >&2; exit 1; }

curl -sS -X PUT "${API}/auth/v1/admin/users/${id}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"password\":\"${pass}\"}" | grep -q '"id"' && echo "Contraseña actualizada." \
    || { echo "No se pudo actualizar" >&2; exit 1; }
