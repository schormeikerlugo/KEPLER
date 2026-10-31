#!/bin/sh
# Crea una cuenta de KEPLER (el registro público está desactivado).
# Las cuentas se identifican por nombre de usuario; internamente Auth usa el
# email <usuario>@kepler.local, que no recibe correos.
#
# Uso (en cortex, dentro del directorio del stack):
#   sh scripts/create-user.sh <usuario> [nombre visible]
# La contraseña se pide por teclado (o se lee de KEPLER_PASSWORD).

set -eu

cd "$(dirname "$0")/.."
. ./.env

usuario="${1:?Uso: create-user.sh <usuario> [nombre visible]}"
visible="${2:-$usuario}"

if ! printf '%s' "$usuario" | grep -Eq '^[a-z0-9_]{3,30}$'; then
    echo "Usuario inválido: 3-30 caracteres, solo minúsculas, números y _" >&2
    exit 1
fi

if [ -z "${KEPLER_PASSWORD:-}" ]; then
    printf "Contraseña para %s: " "$usuario"
    stty -echo; read -r KEPLER_PASSWORD; stty echo; echo
fi

if [ "${#KEPLER_PASSWORD}" -lt 8 ]; then
    echo "La contraseña debe tener al menos 8 caracteres" >&2
    exit 1
fi

curl -sS -X POST "http://localhost:${KEPLER_API_PORT:-54321}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${usuario}@kepler.local\",\"password\":\"${KEPLER_PASSWORD}\",\"email_confirm\":true,\"user_metadata\":{\"nombre_usuario\":\"${usuario}\",\"nombre_visible\":\"${visible}\"}}" \
    | grep -q '"id"' && echo "Cuenta '${usuario}' creada." || { echo "No se pudo crear la cuenta (¿ya existe?)" >&2; exit 1; }
