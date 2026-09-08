#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="${1:?backup dir required}"
docker compose exec -T postgres psql -U bridge -d bridge < "$BACKUP_DIR/postgres.sql"
if [[ -f "$BACKUP_DIR/wordpress.sql" ]]; then
  docker compose exec -T wordpress-db sh -c 'mariadb -uwordpress -p"$MARIADB_PASSWORD" wordpress' < "$BACKUP_DIR/wordpress.sql"
fi
echo "Restore completed"
