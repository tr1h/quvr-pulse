import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalSecret = z.preprocess(emptyToUndefined, z.string().min(8).optional());

export const serverEnvSchema = z.object({
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ROBINHOOD_RPC_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default("https://rpc.mainnet.chain.robinhood.com"),
  ),
  ROBINHOOD_CHAIN_ID: z.preprocess(emptyToUndefined, z.coerce.number().int().default(4663)),
  ALCHEMY_API_KEY: optionalSecret,
  ALCHEMY_RPC_URL: z.preprocess(
    emptyToUndefined,
    z.string().default("https://robinhood-mainnet.g.alchemy.com/v2/{key}"),
  ),
  BLOCKSCOUT_API_KEY: optionalSecret,
  FOMO_API_KEY: optionalSecret,
  TELEGRAM_BOT_TOKEN: optionalSecret,
  TELEGRAM_MODE: z.preprocess(emptyToUndefined, z.enum(["polling", "webhook"]).default("polling")),
  TELEGRAM_WEBHOOK_SECRET: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,256}$/)
      .optional(),
  ),
  TELEGRAM_WEBHOOK_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().default(8787)),
  NEXT_PUBLIC_APP_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default("http://localhost:3000"),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Server-only. Never import into client components. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report field names only — never values.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

export type AppMode = "full" | "onchain-only";

export function appMode(env: ServerEnv = serverEnv()): AppMode {
  return env.FOMO_API_KEY ? "full" : "onchain-only";
}
