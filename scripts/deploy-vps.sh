#!/usr/bin/env bash
set -euo pipefail

echo "=== EduManager Ubuntu VPS Deployment ==="
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — please update secrets before production use!"
fi

docker compose build
docker compose up -d postgres redis backend frontend nginx

echo "Waiting for PostgreSQL..."
sleep 6
docker exec edumanager-backend npx prisma db seed || true

echo "Deployment complete!"
docker compose ps
