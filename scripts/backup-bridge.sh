#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-./.bridge-backups/data}"
STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$OUT/bridge-backup-$STAMP"
mkdir -p "$DEST"
docker compose exec -T postgres pg_dump -U bridge bridge > "$DEST/postgres.sql"
docker compose exec -T wordpress-db sh -c 'mariadb-dump -uwordpress -p"$MARIADB_PASSWORD" wordpress' > "$DEST/wordpress.sql"
cp .env "$DEST/env.bak" 2>/dev/null || true
echo "Backup complete: $DEST"
