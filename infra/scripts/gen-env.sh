#!/bin/sh
# Genera infra/.env con secretos nuevos a partir de .env.example.
# Basado en utils/generate-keys.sh del self-hosting oficial de Supabase.
#
# Uso (en cortex, dentro del directorio del stack):
#   sh scripts/gen-env.sh            # falla si .env ya existe
#   sh scripts/gen-env.sh --force    # sobrescribe (¡invalida la base de datos existente!)

set -eu

cd "$(dirname "$0")/.."

if [ -f .env ] && [ "${1:-}" != "--force" ]; then
    echo "Ya existe .env. Usa --force solo si vas a reiniciar la base de datos desde cero." >&2
    exit 1
fi

command -v openssl >/dev/null 2>&1 || { echo "Se necesita openssl" >&2; exit 1; }

b64url() { openssl enc -base64 -A | tr '+/' '-_' | tr -d '='; }

jwt_secret="$(openssl rand -base64 30)"
header='{"alg":"HS256","typ":"JWT"}'
iat=$(date +%s)
exp=$((iat + 5 * 365 * 24 * 3600))

token() {
    h=$(printf %s "$header" | b64url)
    p=$(printf %s "$1" | b64url)
    s=$(printf %s "$h.$p" | openssl dgst -binary -sha256 -hmac "$jwt_secret" | b64url)
    printf '%s' "$h.$p.$s"
}

anon_key=$(token "{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}")
service_key=$(token "{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}")

sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" \
    -e "s|^ANON_KEY=.*|ANON_KEY=${anon_key}|" \
    -e "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${service_key}|" \
    -e "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d '\n')|" \
    -e "s|^REALTIME_DB_ENC_KEY=.*|REALTIME_DB_ENC_KEY=$(openssl rand -hex 8)|" \
    -e "s|^PG_META_CRYPTO_KEY=.*|PG_META_CRYPTO_KEY=$(openssl rand -base64 24)|" \
    -e "s|^S3_PROTOCOL_ACCESS_KEY_ID=.*|S3_PROTOCOL_ACCESS_KEY_ID=$(openssl rand -hex 16)|" \
    -e "s|^S3_PROTOCOL_ACCESS_KEY_SECRET=.*|S3_PROTOCOL_ACCESS_KEY_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$(openssl rand -hex 16)|" \
    .env.example > .env

chmod 600 .env
echo ".env generado (permisos 600)."
