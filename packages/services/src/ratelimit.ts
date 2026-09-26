import { getRedis, redisReady } from "./redis";

const WINDOWS = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window rate limit for public endpoints, keyed by client identifier (IP / chat id).
 * Redis-backed when available so limits hold across processes; in-memory otherwise.
 */
export async function rateLimit(
  bucket: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }> {
  const key = `rl:${bucket}:${id}`;
  if (redisReady()) {
    try {
      const r = getRedis()!;
      const count = await r.incr(`quvr:${key}`);
      if (count === 1) await r.expire(`quvr:${key}`, windowSeconds);
      const ttl = await r.ttl(`quvr:${key}`);
      return {
        ok: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: Math.max(1, ttl),
      };
    } catch {
      /* fall through to memory */
    }
  }
  const now = Date.now();
  let w = WINDOWS.get(key);
  if (!w || w.resetAt < now) {
    w = { count: 0, resetAt: now + windowSeconds * 1000 };
    WINDOWS.set(key, w);
  }
  w.count++;
  if (WINDOWS.size > 10_000) {
    for (const [k, v] of WINDOWS) if (v.resetAt < now) WINDOWS.delete(k);
  }
  return {
    ok: w.count <= limit,
    remaining: Math.max(0, limit - w.count),
    retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000),
  };
}
