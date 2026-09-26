import { TRANSFER_TOPIC, type ChainProvider } from "@quvr/providers";
import { topicToAddress } from "@quvr/shared";
import type { TransferEvent } from "@quvr/scoring";
import { cacheGet, cacheSet } from "../cache";

export type TransferHistory = {
  transfers: TransferEvent[];
  fromBlock: number;
  toBlock: number;
  complete: boolean;
};

type Stored = {
  fromBlock: number;
  toBlock: number;
  complete: boolean;
  rows: Array<[string, string, string, number, string, number]>;
};

const MAX_LOGS = 120_000;
const KEEP_SECONDS = 6 * 3600;

function pack(h: TransferHistory): Stored {
  return {
    fromBlock: h.fromBlock,
    toBlock: h.toBlock,
    complete: h.complete,
    rows: h.transfers.map((t) => [
      t.from,
      t.to,
      t.value.toString(16),
      t.blockNumber,
      t.txHash,
      t.logIndex,
    ]),
  };
}
function unpack(s: Stored): TransferHistory {
  return {
    fromBlock: s.fromBlock,
    toBlock: s.toBlock,
    complete: s.complete,
    transfers: s.rows.map(([from, to, v, b, tx, li]) => ({
      from,
      to,
      value: BigInt(`0x${v || "0"}`),
      blockNumber: b,
      txHash: tx,
      logIndex: li,
    })),
  };
}

/**
 * Full Transfer history since creation, fetched incrementally: the cached set is extended
 * from its last block (cursor) to the head. Capped at MAX_LOGS → marked incomplete.
 */
const INFLIGHT = new Map<string, Promise<TransferHistory>>();

export class HistoryPendingError extends Error {
  constructor() {
    super("transfer history is loading in the background (public RPC log budget); refresh shortly");
    this.name = "HistoryPendingError";
  }
}

/**
 * Same as fetchTransferHistory but bounded by a time budget: if the (first) load takes
 * longer, it continues in the background (deduplicated) and HistoryPendingError is thrown
 * so the report can render immediately and pick the data up on the next refresh.
 */
export async function loadTransferHistory(
  chain: ChainProvider,
  token: string,
  fromBlock: number,
  head: number,
  budgetMs = 15_000,
): Promise<TransferHistory> {
  const key = `${chain.chain.id}:${token}`;
  let p = INFLIGHT.get(key);
  if (!p) {
    p = fetchTransferHistory(chain, token, fromBlock, head).finally(() => INFLIGHT.delete(key));
    INFLIGHT.set(key, p);
    p.catch(() => undefined);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new HistoryPendingError()), budgetMs);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTransferHistory(
  chain: ChainProvider,
  token: string,
  fromBlock: number,
  head: number,
): Promise<TransferHistory> {
  const key = `transfers:${chain.chain.id}:${token}`;
  const cached = await cacheGet<Stored>(key);
  let base: TransferHistory | null = cached ? unpack(cached.value) : null;
  if (base && base.fromBlock > fromBlock) base = null; // creation block moved earlier → refetch

  const start = base ? base.toBlock + 1 : fromBlock;
  if (base && start > head) return base;

  const res = await chain.getLogsPaginated(
    { address: token, topics: [TRANSFER_TOPIC], fromBlock: start, toBlock: head },
    { maxLogs: MAX_LOGS - (base?.transfers.length ?? 0), maxRequests: 80, initialWindow: 500_000 },
  );
  const fresh: TransferEvent[] = res.logs
    .filter((l) => l.topics.length >= 3 && l.data.length >= 66)
    .map((l) => ({
      from: topicToAddress(l.topics[1]!),
      to: topicToAddress(l.topics[2]!),
      value: BigInt(l.data.slice(0, 66)),
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
      logIndex: l.logIndex,
    }));
  const merged: TransferHistory = {
    transfers: [...(base?.transfers ?? []), ...fresh],
    fromBlock: base?.fromBlock ?? fromBlock,
    toBlock: res.scannedTo,
    complete: (base?.complete ?? true) && res.complete,
  };
  const capped = merged.transfers.length >= MAX_LOGS;
  await cacheSet(key, pack(merged), KEEP_SECONDS);
  // Interrupted before the head (rate limit): progress is cached, resume on the next call.
  if (!res.complete && !capped) throw new HistoryPendingError();
  return merged;
}
