import { getDb } from "@quvr/db";
import type { SocialProvider } from "@quvr/providers";
import { logger } from "@quvr/shared";
import { getRedis, redisReady } from "../redis";
import { safeDb } from "../persistence";

/**
 * Author → confirmed EVM wallet, as reported by the social provider (never inferred).
 *
 * Sources, cheapest first:
 *  1. database (TraderWallet, confirmed);
 *  2. leaderboard sync (250 credits for up to 150 traders, daily job);
 *  3. profile lookup /v2/users/{handle} (2 500 credits, ~45 s) under a daily budget
 *     FOMO_WALLET_LOOKUPS_PER_DAY. "No EVM wallet" answers are cached for 30 days.
 */
const NEGATIVE_TTL_MS = 30 * 86_400_000;

export type WalletLookup = {
  wallet: string | null;
  status: "known" | "resolved" | "no-evm-wallet" | "budget-exhausted" | "not-checked" | "error";
};

async function storeWallet(
  handle: string,
  wallet: string,
  source: string,
  displayName?: string | null,
) {
  const db = getDb();
  const trader = await db.trader.upsert({
    where: { handle },
    create: { handle, displayName: displayName ?? null, walletCheckedAt: new Date() },
    update: { walletCheckedAt: new Date(), ...(displayName ? { displayName } : {}) },
  });
  await db.wallet.upsert({ where: { address: wallet }, create: { address: wallet }, update: {} });
  await db.traderWallet.upsert({
    where: { traderId_walletAddress: { traderId: trader.id, walletAddress: wallet } },
    create: { traderId: trader.id, walletAddress: wallet, confirmed: true, source },
    update: { confirmed: true, source },
  });
}

export async function knownWallet(
  handle: string,
): Promise<{ wallet: string | null; checkedAt: Date | null }> {
  return safeDb(
    "knownWallet",
    async () => {
      const t = await getDb().trader.findFirst({
        where: { handle: { equals: handle, mode: "insensitive" } },
        include: { wallets: { where: { confirmed: true }, take: 1 } },
      });
      return {
        wallet: t?.wallets[0]?.walletAddress ?? null,
        checkedAt: t?.walletCheckedAt ?? null,
      };
    },
    { wallet: null, checkedAt: null },
  );
}

async function takeDailyBudget(): Promise<boolean> {
  const limit = Math.max(0, Number(process.env.FOMO_WALLET_LOOKUPS_PER_DAY ?? "3"));
  if (limit === 0 || !redisReady()) return false; // never spend credits without a shared counter
  const key = `quvr:fomo:wallet-lookups:${new Date().toISOString().slice(0, 10)}`;
  const used = await getRedis()!.incr(key);
  if (used === 1) await getRedis()!.expire(key, 2 * 86_400);
  return used <= limit;
}

/**
 * Resolves an author's wallet. With allowPaid=false (scan path) only free sources are used,
 * so a page view never spends credits or waits ~45 s.
 */
export async function resolveAuthorWallet(
  social: SocialProvider,
  handle: string,
  opts: { allowPaid: boolean },
): Promise<WalletLookup> {
  const known = await knownWallet(handle);
  if (known.wallet) return { wallet: known.wallet, status: "known" };
  if (known.checkedAt && Date.now() - known.checkedAt.getTime() < NEGATIVE_TTL_MS) {
    return { wallet: null, status: "no-evm-wallet" };
  }
  if (!opts.allowPaid || !social.isEnabled()) return { wallet: null, status: "not-checked" };
  if (!(await takeDailyBudget())) return { wallet: null, status: "budget-exhausted" };
  try {
    const user = await social.getUser(handle);
    if (user?.evmWallet) {
      await safeDb(
        "storeWallet",
        () => storeWallet(handle, user.evmWallet!, "fomoapi-profile", user.displayName),
        undefined,
      );
      return { wallet: user.evmWallet, status: "resolved" };
    }
    await safeDb(
      "walletNegative",
      () =>
        getDb().trader.upsert({
          where: { handle },
          create: { handle, walletCheckedAt: new Date() },
          update: { walletCheckedAt: new Date() },
        }),
      undefined,
    );
    return { wallet: null, status: "no-evm-wallet" };
  } catch (e) {
    logger.warn("wallet lookup failed", { handle, error: (e as Error).message });
    return { wallet: null, status: "error" };
  }
}

/** Daily job: store wallets of leaderboard traders (2 × 250 credits for up to 250 traders). */
export async function syncLeaderboardWallets(social: SocialProvider): Promise<number> {
  if (!social.isEnabled()) return 0;
  let stored = 0;
  for (const window of ["30d", "all"] as const) {
    try {
      for (const t of await social.getLeaderboard(window)) {
        if (!t.evmWallet) continue;
        await safeDb(
          "leaderboardWallet",
          () => storeWallet(t.handle, t.evmWallet!, "fomoapi-leaderboard", t.displayName),
          undefined,
        );
        stored++;
      }
    } catch (e) {
      logger.warn("leaderboard sync failed", { window, error: (e as Error).message });
    }
  }
  return stored;
}
