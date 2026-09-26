# Deploy (single VPS)

Stack: Caddy (HTTPS) → web (Next.js) · worker (BullMQ) · bot (Telegram) · Postgres · Redis,
all in Docker on one Ubuntu server. Measured idle memory ≈ 400 MB, so a 4 GB VPS is enough.

## 1. Server (once)

```bash
ssh ubuntu@SERVER_IP
# setup-server.sh is copied by step 2 (do step 2 first), then:
bash /tmp/setup-server.sh   # updates, Docker, 2 GB swap, firewall (22/80/443), auto security updates
exit                        # log in again so the docker group applies
```

## 2. Code and config (from the Windows machine, in the repo folder)

```powershell
node scripts/make-prod-env.mjs --ip SERVER_IP        # later: --domain quvrpulse.com
tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env --exclude=.env.production -czf quvr.tgz .
scp quvr.tgz .env.production deploy/setup-server.sh ubuntu@SERVER_IP:/tmp/
```

`.env.production` holds the API keys and generated secrets (database password, webhook secret).
It is git-ignored and is copied straight to the server; the script never prints values.

## 3. Start

```bash
ssh ubuntu@SERVER_IP
cd /opt/quvr-pulse && tar -xzf /tmp/quvr.tgz && mv /tmp/.env.production . && rm /tmp/quvr.tgz
bash deploy/deploy.sh      # build (~4 min), migrate, start; prints container status and health
```

Updates: repeat step 2 (without regenerating secrets — the script keeps them) and `bash deploy/deploy.sh`.

## 4. Domain

1. At the registrar: `A` records for `@` and `www` → SERVER_IP.
2. `node scripts/make-prod-env.mjs --domain quvrpulse.com`, copy `.env.production`, `bash deploy/deploy.sh`.
   Caddy obtains Let's Encrypt certificates; the bot switches to webhook mode (`/telegram/webhook`,
   secret-token verified) and registers the webhook itself.

## Operations

- Logs: `docker compose --env-file .env.production -f deploy/docker-compose.prod.yml logs -f web worker`
- Database backup: `docker compose ... exec -T postgres pg_dump -U quvr quvr_pulse | gzip > backup.sql.gz`
- Market/liquidity snapshots older than `SNAPSHOT_RETENTION_DAYS` (30) are pruned daily; score history is kept.

## Server-only secrets

After the first deploy, `.env.production` on the server is the source of truth: the Telegram bot
token is written there directly (never on the dev machine — a local bot with the same token would
steal updates from the server). Code updates ship only the archive; change settings on the server:

```bash
cd /opt/quvr-pulse
sed -i 's|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://quvrpulse.com|' .env.production
bash deploy/deploy.sh
```
