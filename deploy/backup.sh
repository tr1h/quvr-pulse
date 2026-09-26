#!/usr/bin/env bash
# Daily PostgreSQL backup on the VPS (installed as a cron job by deploy/install-backup.sh).
# Keeps the last KEEP dumps in /opt/quvr-pulse/backups. Restore:
#   gunzip -c backups/quvr-YYYYmmdd-HHMM.sql.gz | docker compose --env-file .env.production \
#     -f deploy/docker-compose.prod.yml exec -T postgres psql -U quvr -d quvr_pulse
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP="${KEEP:-7}"
mkdir -p backups
chmod 700 backups
out="backups/quvr-$(date -u +%Y%m%d-%H%M).sql.gz"
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U quvr -d quvr_pulse --no-owner --clean --if-exists | gzip -9 > "$out.tmp"
# An empty or truncated dump must never replace a good one.
if [ "$(gzip -cd "$out.tmp" | head -c 100 | wc -c)" -lt 100 ]; then
  rm -f "$out.tmp"
  echo "backup failed: empty dump" >&2
  exit 1
fi
mv "$out.tmp" "$out"
chmod 600 "$out"
ls -1t backups/quvr-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "backup ok: $out ($(du -h "$out" | cut -f1))"
