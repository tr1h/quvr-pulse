#!/usr/bin/env bash
# One-time: schedule deploy/backup.sh every day at 03:30 UTC and run it once now.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="$(pwd)"
chmod +x deploy/backup.sh
cat > /etc/cron.d/quvr-backup <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root $DIR/deploy/backup.sh >> /var/log/quvr-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/quvr-backup
bash deploy/backup.sh
