#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER_NAME="${POSTGRES_CONTAINER:-edumanager-postgres}"
DB_USER="${POSTGRES_USER:-edumanager}"
DB_NAME="${POSTGRES_DB:-edumanager_db}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"
OUT_FILE="$BACKUP_DIR/edumanager_${TIMESTAMP}.sql.gz"

echo "Creating PostgreSQL backup: $OUT_FILE"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT_FILE"

# Keep last 14 days of backups
find "$BACKUP_DIR" -name "edumanager_*.sql.gz" -mtime +14 -delete
echo "Backup completed: $OUT_FILE"
