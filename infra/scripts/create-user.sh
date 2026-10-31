#!/bin/sh
# Crea un usuario de KEPLER (el registro público está desactivado).
#
# Uso (en cortex, dentro del directorio del stack):
#   sh scripts/create-user.sh <email> <nombre_usuario>
# La contraseña se pide por teclado (o se lee de KEPLER_PASSWORD).

set -eu

cd "$(dirname "$0")/.."
. ./.env

email="${1:?Uso: create-user.sh <email> <nombre_usuario>}"
username="${2:?Uso: create-user.sh <email> <nombre_usuario>}"

if [ -z "${KEPLER_PASSWORD:-}" ]; then
    printf "Contraseña para %s: " "$email"
    stty -echo; read -r KEPLER_PASSWORD; stty echo; echo
fi

curl -sS -X POST "http://localhost:${KEPLER_API_PORT:-54321}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${KEPLER_PASSWORD}\",\"email_confirm\":true,\"user_metadata\":{\"nombre_usuario\":\"${username}\"}}"
echo
