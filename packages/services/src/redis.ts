import { Redis } from "ioredis";
import { logger, serverEnv } from "@quvr/shared";

const g = globalThis as unknown as { __quvrRedis?: Redis | null; __quvrRedisDownUntil?: number };

/**
 * Shared Redis connection, or null when REDIS_URL is not configured / unreachable.
 * Callers must degrade gracefully (in-memory fallbacks) — Redis outages never break pages.
 */
export function getRedis(): Redis | null {
  if (g.__quvrRedis !== undefined) return g.__quvrRedis;
  const url = serverEnv().REDIS_URL;
  if (!url) {
    g.__quvrRedis = null;
    return null;
  }
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  let warned = false;
  client.on("error", (e) => {
    if (!warned) logger.warn("redis unavailable, using in-memory fallback", { error: e.message });
    warned = true;
  });
  client.on("ready", () => {
    warned = false;
  });
  g.__quvrRedis = client;
  return client;
}

export function redisReady(): boolean {
  const r = getRedis();
  return !!r && r.status === "ready";
}

/** Connection options for BullMQ (which needs maxRetriesPerRequest: null). */
export function bullConnection() {
  const url = serverEnv().REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for background jobs");
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}
