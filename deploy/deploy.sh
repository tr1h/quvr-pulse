#!/usr/bin/env bash
# Build and (re)start the stack on the server. Run inside /opt/quvr-pulse:
#   bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
test -f .env.production || { echo "missing .env.production"; exit 1; }
chmod 600 .env.production
COMPOSE="docker compose --env-file .env.production -f deploy/docker-compose.prod.yml"
$COMPOSE build
$COMPOSE up -d --remove-orphans
docker image prune -f >/dev/null
$COMPOSE ps
echo "Health: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health || true)"
