#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-admin@edumanager.uz}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: ./scripts/init-ssl.sh yourdomain.uz admin@yourdomain.uz"
  exit 1
fi

mkdir -p ./nginx/certs ./nginx/certbot

echo "Generating Let's Encrypt certificate for $DOMAIN..."
docker run --rm \
  -v "$(pwd)/nginx/certs:/etc/letsencrypt" \
  -v "$(pwd)/nginx/certbot:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  --preferred-challenges http \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

sed "s/YOUR_DOMAIN.uz/$DOMAIN/g" ./nginx/conf.d/edumanager.ssl.conf.template > ./nginx/conf.d/default.conf
echo "SSL configured in ./nginx/conf.d/default.conf. Restart nginx with: docker compose restart nginx"
