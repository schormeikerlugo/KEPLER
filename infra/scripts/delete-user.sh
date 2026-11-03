#!/bin/sh
# Elimina una cuenta de KEPLER con todos sus datos y sus fotos.
# Los datos se borran en cascada al eliminar el usuario de Auth, pero las fotos
# de Storage no: se borran antes, en todos los buckets (`<user_id>/...`).
# Con --huerfanas, además, las fotos de cuentas que ya no existen.
#
# Uso (en cortex, dentro del directorio del stack):
#   sh scripts/delete-user.sh <usuario> [--huerfanas]
#   sh scripts/delete-user.sh --huerfanas

set -eu

cd "$(dirname "$0")/.."
. ./.env

API="http://localhost:${KEPLER_API_PORT:-54321}"
sql() {
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" kepler-db \
        psql -h localhost -U supabase_admin -d postgres -tAc "$1"
}

# Borra de cada bucket los objetos que cumplan la condición SQL `$1` (sobre o.name)
borrar_fotos() {
    for bucket in $(sql "select id from storage.buckets"); do
        nombres=$(sql "select json_agg(name) from storage.objects o where bucket_id = '$bucket' and ($1)")
        total=$(sql "select count(*) from storage.objects o where bucket_id = '$bucket' and ($1)")
        if [ -n "$nombres" ]; then
            curl -sS -o /dev/null -X DELETE "$API/storage/v1/object/$bucket" \
                -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
                -H "Content-Type: application/json" -d "{\"prefixes\": $nombres}"
            echo "  $bucket: $total fotos"
        fi
    done
}

usuario=""
huerfanas=0
for a in "$@"; do
    case "$a" in
        --huerfanas) huerfanas=1 ;;
        *) usuario="$a" ;;
    esac
done
[ -n "$usuario" ] || [ "$huerfanas" = 1 ] || { echo "Uso: delete-user.sh <usuario> [--huerfanas]" >&2; exit 2; }

if [ -n "$usuario" ]; then
    if ! printf '%s' "$usuario" | grep -Eq '^[a-z0-9_]{3,30}$'; then
        echo "Usuario inválido" >&2
        exit 1
    fi
    id=$(sql "select id from public.perfiles where nombre_usuario = '$usuario'")
    [ -n "$id" ] || { echo "No existe la cuenta '$usuario'" >&2; exit 1; }
    echo "Fotos de '$usuario':"
    borrar_fotos "split_part(o.name, '/', 1) = '$id'"
    curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/auth/v1/admin/users/$id" \
        -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" | grep -q '^2' \
        && echo "Cuenta '$usuario' eliminada." || { echo "No se pudo eliminar la cuenta" >&2; exit 1; }
fi

if [ "$huerfanas" = 1 ]; then
    echo "Fotos huérfanas:"
    borrar_fotos "not exists (select 1 from auth.users u where u.id::text = split_part(o.name, '/', 1))"
fi
