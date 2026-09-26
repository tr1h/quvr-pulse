import { sha256 } from "@noble/hashes/sha2";
import { base58 } from "@scure/base";
import { getSolanaRpc, type EnhancedTx } from "@quvr/providers";
import { findRelatedClusters, type TransferEvent } from "@quvr/scoring";
import { isOnCurve, type DeployerAction, type RelatedCluster } from "@quvr/shared";
import { cacheGet, cacheSet, swr } from "../cache";

/**
 * Solana creator and "possibly related wallets".
 *
 * Creator: pump.fun tokens record the creator in their bonding-curve account (exact, one read);
 * otherwise the fee payer of the mint's first transaction (Helius oldest-first history).
 *
 * Relations (heuristics — never a claim of common ownership):
 *  - received-from-deployer: the creator sent this token to the holder (not a swap);
 *  - funded-by-deployer / common-funding-source: fee payer of the holder's very first
 *    transaction (typically whoever sent it its first SOL);
 *  - same-first-buy-block: the holder's token account was first used in the same slot as others'.
 * First transactions never change, so they are cached for 30 days.
 */
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const POOL = "pool"; // pseudo address marking "came from a pool/program" in synthetic transfers

export function findPda(seeds: Uint8Array[], programId: string): string | null {
  const prog = base58.decode(programId);
  const tag = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), prog, tag];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    const h = base58.encode(sha256(buf));
    if (!isOnCurve(h)) return h;
  }
  return null;
}

export type SolanaCreation = {
  creator: string | null;
  method: "pump.fun bonding curve" | "first mint transaction" | null;
  txSignature: string | null;
  createdAt: string | null;
  slot: number | null;
  launchpad: string | null;
};

export async function detectSolanaCreation(mint: string): Promise<SolanaCreation> {
  const r = await swr(
    `sol-creation:${mint}`,
    { freshSeconds: 30 * 86_400, keepSeconds: 60 * 86_400 },
    async () => {
      const rpc = getSolanaRpc();
      let creator: string | null = null;
      let method: SolanaCreation["method"] = null;
      let launchpad: string | null = null;
      // pump.fun: bonding curve PDA ["bonding-curve", mint]; creator pubkey at offset 49 (layout
      // verified on-chain: 8 discriminator + 5×u64 reserves/supply + bool complete).
      const curve = findPda(
        [new TextEncoder().encode("bonding-curve"), base58.decode(mint)],
        PUMP_PROGRAM,
      );
      if (curve) {
        const acc = await rpc.getAccountData(curve).catch(() => null);
        if (acc && acc.owner === PUMP_PROGRAM && acc.data.length >= 81) {
          creator = base58.encode(acc.data.subarray(49, 81));
          method = "pump.fun bonding curve";
          launchpad = curve;
        }
      }
      const first = (await rpc.getOldestSignatures(mint, 1).catch(() => null))?.[0] ?? null;
      let payer: string | null = null;
      if (first)
        payer =
          (await rpc.getTransactionPayer(first.signature).catch(() => null))?.feePayer ?? null;
      if (!creator && payer) {
        creator = payer;
        method = "first mint transaction";
      }
      return {
        creator,
        method,
        txSignature: first?.signature ?? null,
        createdAt: first?.blockTime ? new Date(first.blockTime * 1000).toISOString() : null,
        slot: first?.slot ?? null,
        launchpad,
      } satisfies SolanaCreation;
    },
  );
  return r.value;
}

/** Creator's actions with this token from parsed history (newest first, up to 300 txs). */
export async function solanaCreatorActions(
  mint: string,
  creator: string,
): Promise<{ actions: DeployerAction[]; txs: EnhancedTx[] | null }> {
  const r = await swr(
    `sol-creator-txs:${creator}`,
    { freshSeconds: 600, keepSeconds: 86_400 },
    async () => getSolanaRpc().getEnhancedTransactions(creator, 3),
  );
  const txs = r.value;
  if (!txs) return { actions: [], txs: null };
  const actions: DeployerAction[] = [];
  for (const tx of txs) {
    for (const tt of tx.tokenTransfers.filter((x) => x.mint === mint)) {
      const out = tt.fromUserAccount === creator;
      const inn = tt.toUserAccount === creator;
      if (!out && !inn) continue;
      const swap = tx.type === "SWAP" || /PUMP|RAYDIUM|JUPITER|METEORA|ORCA/i.test(tx.source ?? "");
      actions.push({
        kind:
          tx.type === "CREATE"
            ? "create"
            : swap
              ? out
                ? "sell"
                : "buy"
              : out
                ? "transfer-out"
                : "transfer-in",
        amount: tt.tokenAmount,
        counterparty: out ? tt.toUserAccount : tt.fromUserAccount,
        txHash: tx.signature,
        blockNumber: 0,
        timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null,
      });
    }
  }
  return { actions: actions.slice(0, 50), txs };
}

type HolderFirst = { funder: string | null; firstSlot: number | null };

/** Fee payer of a wallet's very first transaction (immutable → cached 30 days). */
async function firstFunder(wallet: string): Promise<string | null> {
  const key = `sol-first-funder:${wallet}`;
  const c = await cacheGet<string | null>(key);
  if (c) return c.value;
  const rpc = getSolanaRpc();
  const first = (await rpc.getOldestSignatures(wallet, 1))?.[0];
  if (!first) return null;
  const payer = (await rpc.getTransactionPayer(first.signature))?.feePayer ?? null;
  const funder = payer && payer !== wallet ? payer : null;
  await cacheSet(key, funder, 30 * 86_400);
  return funder;
}

/** Slot of the first activity of a token account (≈ first buy) — immutable. */
async function firstSlot(tokenAccount: string): Promise<number | null> {
  const key = `sol-first-slot:${tokenAccount}`;
  const c = await cacheGet<number | null>(key);
  if (c) return c.value;
  const first = (await getSolanaRpc().getOldestSignatures(tokenAccount, 1))?.[0] ?? null;
  const slot = first?.slot ?? null;
  await cacheSet(key, slot, 30 * 86_400);
  return slot;
}

const SERVICE_TX_PER_HOUR = 50;

/** true when the address behaves like an exchange/bridge/bot (very high tx rate). Cached 7 days. */
async function isBusyService(address: string): Promise<boolean> {
  const key = `sol-busy:${address}`;
  const c = await cacheGet<boolean>(key);
  if (c) return c.value;
  const sigs = await getSolanaRpc()
    .getRecentSignatures(address, 1000)
    .catch(() => null);
  let busy = false;
  if (sigs && sigs.length >= 200) {
    const times = sigs.map((x) => x.blockTime).filter((x): x is number => x !== null);
    const hours = (Math.max(...times) - Math.min(...times)) / 3600;
    busy = sigs.length / Math.max(hours, 0.01) > SERVICE_TX_PER_HOUR;
  }
  await cacheSet(key, busy, 7 * 86_400);
  return busy;
}

export async function solanaRelatedClusters(input: {
  holders: Array<{ owner: string; tokenAccount: string | null; amountRaw: bigint }>;
  creator: string | null;
  creatorTxs: EnhancedTx[] | null;
  mint: string;
  supplyRaw: bigint;
  maxHolders?: number;
}): Promise<{
  clusters: RelatedCluster[];
  coverage: { funders: number; firstBuys: number; checked: number; serviceFunders: number };
}> {
  const list = input.holders.slice(0, input.maxHolders ?? 12);
  const firsts = new Map<string, HolderFirst>();
  for (const h of list) {
    const [funder, slot] = await Promise.all([
      firstFunder(h.owner).catch(() => null),
      h.tokenAccount ? firstSlot(h.tokenAccount).catch(() => null) : Promise.resolve(null),
    ]);
    firsts.set(h.owner, { funder, firstSlot: slot });
  }

  // A shared funder only means something if it is not a busy service (exchange hot wallet,
  // bridge, bot): those fund thousands of unrelated wallets. Measured: real CEX/bot funders do
  // 750–10 000 tx/h, so anything above SERVICE_TX_PER_HOUR is ignored as a relation signal.
  const funderCounts = new Map<string, number>();
  for (const f of firsts.values())
    if (f.funder) funderCounts.set(f.funder, (funderCounts.get(f.funder) ?? 0) + 1);
  const services = new Set<string>();
  for (const [funder, n] of funderCounts) {
    if (n < 2 && funder !== input.creator) continue;
    if (await isBusyService(funder)) services.add(funder);
  }
  for (const f of firsts.values()) if (f.funder && services.has(f.funder)) f.funder = null;

  // Synthetic transfer events so the tested EVM heuristics can be reused.
  const transfers: TransferEvent[] = [];
  let i = 0;
  for (const h of list) {
    const s = firsts.get(h.owner)?.firstSlot;
    if (s)
      transfers.push({
        from: POOL,
        to: h.owner,
        value: 1n,
        blockNumber: s,
        txHash: `first-${i++}`,
        logIndex: 0,
      });
  }
  const holderSet = new Set(list.map((h) => h.owner));
  if (input.creator && input.creatorTxs) {
    for (const tx of input.creatorTxs) {
      if (tx.type === "SWAP") continue;
      for (const tt of tx.tokenTransfers) {
        if (
          tt.mint === input.mint &&
          tt.fromUserAccount === input.creator &&
          tt.toUserAccount &&
          holderSet.has(tt.toUserAccount)
        ) {
          transfers.push({
            from: input.creator,
            to: tt.toUserAccount,
            value: 1n,
            blockNumber: 0,
            txHash: tx.signature,
            logIndex: 0,
          });
        }
      }
    }
  }
  transfers.sort((a, b) => a.blockNumber - b.blockNumber);
  const balances = new Map(list.map((h) => [h.owner, h.amountRaw]));
  const fundingSources = new Map([...firsts].map(([w, f]) => [w, f.funder]));
  const clusters = findRelatedClusters(
    {
      holders: [...holderSet, ...(input.creator ? [input.creator] : [])],
      transfers,
      deployer: input.creator,
      poolAddresses: new Set([POOL]),
      fundingSources,
      sequentialWindowBlocks: 0,
    },
    balances,
    input.supplyRaw,
  );
  return {
    clusters,
    coverage: {
      checked: list.length,
      funders: [...firsts.values()].filter((f) => f.funder).length,
      firstBuys: [...firsts.values()].filter((f) => f.firstSlot).length,
      serviceFunders: services.size,
    },
  };
}
