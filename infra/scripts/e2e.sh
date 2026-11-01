#!/bin/sh
# Prueba de punta a punta contra el stack de cortex con cuentas temporales
# (e2e_uno, e2e_dos) que se borran al terminar, junto con los avisos que
# hayan generado a las cuentas reales y las fotos que queden huérfanas en Storage.
#
# Uso (desde la PC de desarrollo): sh infra/scripts/e2e.sh
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PASS='E2e-Prueba-2026'

borrar() {
  ssh cortex 'cd ~/services/kepler && . ./.env && for u in e2e_uno e2e_dos; do
    id=$(docker exec -e PGPASSWORD=$POSTGRES_PASSWORD kepler-db psql -h localhost -U supabase_admin -d postgres -tAc "select id from perfiles where nombre_usuario = '"'"'$u'"'"'");
    [ -n "$id" ] && curl -s -o /dev/null -X DELETE "http://localhost:54321/auth/v1/admin/users/$id" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY";
  done;
  docker exec -e PGPASSWORD=$POSTGRES_PASSWORD kepler-db psql -h localhost -U supabase_admin -d postgres -tAc "delete from notificaciones where contexto->>'"'"'autor'"'"' in ('"'"'e2e_uno'"'"', '"'"'e2e_dos'"'"')" >/dev/null;
  huerfanas=$(docker exec -e PGPASSWORD=$POSTGRES_PASSWORD kepler-db psql -h localhost -U supabase_admin -d postgres -tAc "select json_agg(name) from storage.objects o where bucket_id = '"'"'capturas'"'"' and not exists (select 1 from auth.users u where u.id::text = split_part(o.name, '"'"'/'"'"', 1))");
  [ -n "$huerfanas" ] && curl -s -o /dev/null -X DELETE "http://localhost:54321/storage/v1/object/capturas" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "{\"prefixes\": $huerfanas}";
  docker exec -e PGPASSWORD=$POSTGRES_PASSWORD kepler-db psql -h localhost -U supabase_admin -d postgres -tAc "select count(*) from auth.users"'
}

borrar >/dev/null
ssh cortex "cd ~/services/kepler && for u in e2e_uno e2e_dos; do KEPLER_PASSWORD=$PASS sh scripts/create-user.sh \$u; done"

cd "$REPO"
KEPLER_E2E_API=http://192.168.68.117:8000 \
KEPLER_E2E_AUTH=http://192.168.68.117:54321 \
KEPLER_E2E_ANON=$(ssh cortex 'grep ^ANON_KEY= ~/services/kepler/.env | cut -d= -f2-') \
KEPLER_E2E_USUARIOS=e2e_uno,e2e_dos \
KEPLER_E2E_PASSWORD=$PASS \
KEPLER_E2E_MODELOS="$REPO/models/onnx" \
cargo test -q -p kepler-server --test e2e -- --ignored --nocapture 2>&1 | grep -vE "^\s*(Compiling|Running|Finished)" | cut -c1-300 | tail -40

printf "usuarios restantes tras limpiar (incluye los reales): "
borrar
