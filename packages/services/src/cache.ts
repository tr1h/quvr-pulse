import { logger } from "@quvr/shared";
import { checkOperation, withOperationTimeout } from "@quvr/providers";
import { redisReady, getRedis } from "./redis";

type Entry<T> = { value: T; storedAt: number };

const MEMORY = new Map<string, Entry<unknown> & { expiresAt: number }>();
const MEMORY_MAX = 500;
/**
 * Loads in progress, deduplicated per key. The deadline cancels provider work and prevents
 * late completions from overwriting a replacement result.
 */
const INFLIGHT = new Map<string, { p: Promise<unknown>; at: number }>();
const INFLIGHT_MAX_MS = 3 * 60_000;

const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? { __big: v.toString() } : v);
const reviver = (_k: string, v: unknown) =>
  v && typeof v === "object" && "__big" in (v as object)
    ? BigInt((v as { __big: string }).__big)
    : v;

async function readEntry<T>(key: string): Promise<Entry<T> | null> {
  if (redisReady()) {
    try {
      const raw = await getRedis()!.get(`quvr:${key}`);
      if (raw) return JSON.parse(raw, reviver) as Entry<T>;
      return null;
    } catch (e) {
      logger.debug("cache read failed", { key, error: (e as Error).message });
    }
  }
  const m = MEMORY.get(key);
  if (!m) return null;
  if (m.expiresAt < Date.now()) {
    MEMORY.delete(key);
    return null;
  }
  return m as Entry<T>;
}

async function writeEntry<T>(key: string, value: T, keepSeconds: number) {
  checkOperation();
  const entry: Entry<T> = { value, storedAt: Date.now() };
  if (redisReady()) {
    try {
      await getRedis()!.set(`quvr:${key}`, JSON.stringify(entry, replacer), "EX", keepSeconds);
      return;
    } catch (e) {
      logger.debug("cache write failed", { key, error: (e as Error).message });
    }
  }
  checkOperation();
  if (MEMORY.size >= MEMORY_MAX) MEMORY.delete(MEMORY.keys().next().value!);
  MEMORY.set(key, { ...entry, expiresAt: Date.now() + keepSeconds * 1000 });
}

export async function cacheGet<T>(key: string): Promise<{ value: T; ageMs: number } | null> {
  const e = await readEntry<T>(key);
  return e ? { value: e.value, ageMs: Date.now() - e.storedAt } : null;
}

export async function cacheSet<T>(key: string, value: T, keepSeconds: number) {
  await writeEntry(key, value, keepSeconds);
}

export type SwrResult<T> = { value: T; fetchedAt: string; isStale: boolean };

/**
 * Stale-while-revalidate:
 *  - fresh hit → returned;
 *  - stale hit → returned immediately (isStale), refresh runs in the background;
 *  - miss → loader runs (deduplicated per key).
 * Errors are NEVER cached: a failing loader leaves the last good value in place,
 * and a miss + failure rethrows so callers can show "no data".
 */
export async function swr<T>(
  key: string,
  opts: { freshSeconds: number; keepSeconds: number },
  loader: () => Promise<T>,
): Promise<SwrResult<T>> {
  const hit = await readEntry<T>(key);
  const run = () => {
    const existing = INFLIGHT.get(key);
    if (existing) return existing.p as Promise<T>;
    const p: Promise<T> = withOperationTimeout(INFLIGHT_MAX_MS, async () => {
      const v = await loader();
      checkOperation();
      await writeEntry(key, v, opts.keepSeconds);
      return v;
    }).finally(() => {
      if (INFLIGHT.get(key)?.p === p) INFLIGHT.delete(key);
    });
    INFLIGHT.set(key, { p, at: Date.now() });
    return p;
  };

  if (hit) {
    const age = Date.now() - hit.storedAt;
    const fetchedAt = new Date(hit.storedAt).toISOString();
    if (age < opts.freshSeconds * 1000) return { value: hit.value, fetchedAt, isStale: false };
    run().catch((e) =>
      logger.debug("background revalidate failed", { key, error: (e as Error).message }),
    );
    return { value: hit.value, fetchedAt, isStale: true };
  }
  const value = await run();
  return { value, fetchedAt: new Date().toISOString(), isStale: false };
}

/** Best-effort distributed lock; returns true when acquired (or when Redis is absent). */
export async function tryLock(key: string, ttlMs: number): Promise<boolean> {
  if (!redisReady()) return true;
  try {
    return (await getRedis()!.set(`quvr:lock:${key}`, "1", "PX", ttlMs, "NX")) === "OK";
  } catch {
    return true;
  }
}

export async function unlock(key: string) {
  if (!redisReady()) return;
  try {
    await getRedis()!.del(`quvr:lock:${key}`);
  } catch {
    /* ignore */
  }
}
