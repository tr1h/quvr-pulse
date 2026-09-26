# QUVR Pulse — one image for web, worker and bot (the command differs per service).
FROM node:20-bookworm-slim AS app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first (cached while package manifests are unchanged).
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/telegram/package.json apps/telegram/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/providers/package.json packages/providers/
COPY packages/scoring/package.json packages/scoring/
COPY packages/services/package.json packages/services/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
  && rm -rf apps/web/.next/cache

ENV NODE_ENV=production
USER node
EXPOSE 3000 8787
CMD ["npm", "run", "start", "-w", "@quvr/web"]
