#!/usr/bin/env bash
# Ship the current working tree to the VPS and rebuild there. Run from the repo root (Git Bash):
#   bash deploy/push.sh
# Secrets never travel: .env files are excluded; the server keeps its own .env.production.
set -euo pipefail
# Target host comes from QUVR_HOST or the untracked file deploy/.host (e.g. root@your-server).
HOST="${QUVR_HOST:-$(cat "$(dirname "$0")/.host" 2>/dev/null || true)}"
if [ -z "$HOST" ]; then echo "set QUVR_HOST or create deploy/.host" >&2; exit 1; fi
KEY="${QUVR_SSH_KEY:-$HOME/.ssh/id_ed25519_service2}"
DIR=/opt/quvr-pulse
# Windows paths (cygpath -w): OpenSSH in Git Bash can mis-encode a non-ASCII home directory.
if command -v cygpath >/dev/null; then
  KEY="$(cygpath -w "$KEY")"
  KNOWN="$(cygpath -w "$HOME/.ssh/known_hosts")"
else
  KNOWN="$HOME/.ssh/known_hosts"
fi
OPTS=(-i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 -o UserKnownHostsFile="$KNOWN")
SSH=(ssh "${OPTS[@]}" "$HOST")

tmp="$(mktemp -d)"
tar --exclude=./node_modules --exclude='*/node_modules' --exclude=./apps/web/.next --exclude=./.git \
  --exclude=./.env --exclude=./.env.production --exclude=./.claude --exclude=./test-results \
  --exclude=./playwright-report --exclude='*.tsbuildinfo' --exclude=./docs/brand \
  -czf "$tmp/quvr.tgz" .
if tar -tzf "$tmp/quvr.tgz" | grep -Eq '(^|/)\.env(\.production)?$'; then
  echo "refusing to ship an .env file" >&2
  exit 1
fi
echo "archive: $(du -h "$tmp/quvr.tgz" | cut -f1)"
scp "${OPTS[@]}" -q "$tmp/quvr.tgz" "$HOST:/root/quvr.tgz"
rm -rf "$tmp"
# Source trees are replaced wholesale so files deleted locally disappear on the server too
# (.env.production, backups/ and docs/ are left alone).
"${SSH[@]}" "cd $DIR && rm -rf apps packages e2e scripts contracts && tar --no-same-owner -xzf /root/quvr.tgz -C $DIR && rm /root/quvr.tgz && bash deploy/deploy.sh"
