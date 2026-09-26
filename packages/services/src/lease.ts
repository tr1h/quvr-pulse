import { randomUUID } from "node:crypto";
import { getRedis } from "./redis";

/** Owner-checked release; configured Redis outages never grant a lock. */
export async function acquireLease(
  key: string,
  ttlMs: number,
): Promise<null | (() => Promise<void>)> {
  const redis = getRedis();
  if (!redis) return async () => {};
  if (redis.status !== "ready") return null;
  const owner = randomUUID();
  const name = `quvr:lease:${key}`;
  try {
    if ((await redis.set(name, owner, "PX", ttlMs, "NX")) !== "OK") return null;
  } catch {
    return null;
  }
  return async () => {
    await redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
        1,
        name,
        owner,
      )
      .catch(() => undefined);
  };
}
