#!/bin/bash
# Backup diario de la base de datos. Corre dentro del contenedor kepler-backup.
# Un dump por día a partir de BACKUP_HOUR; borra los de más de BACKUP_RETENTION_DAYS.

set -u

mkdir -p /backups

while true; do
    today=$(date +%F)
    file="/backups/kepler-${today}.dump"

    if [ ! -f "$file" ] && [ "$(date +%-H)" -ge "${BACKUP_HOUR}" ]; then
        echo "[backup] $(date -Is) creando ${file}"
        if pg_dump --format=custom --no-owner --file="${file}.tmp" "${PGDATABASE}"; then
            mv "${file}.tmp" "$file"
            echo "[backup] ok ($(du -h "$file" | cut -f1))"
            find /backups -name 'kepler-*.dump' -mtime +"${BACKUP_RETENTION_DAYS}" -print -delete
        else
            rm -f "${file}.tmp"
            echo "[backup] ERROR en pg_dump, reintento en 10 min" >&2
        fi
    fi

    sleep 600
done
