import type { RiskLevel } from "@quvr/shared";

/**
 * Ticker clones: other tokens on the same chain using the same ticker (or the exact same name).
 * Copies of popular memecoins are a common trap for people who search by ticker. We never call
 * any of them "official" or "fake" — we only say whether a larger token with this ticker exists.
 */
export type CloneCandidate = {
  address: string;
  symbol: string | null;
  name: string | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  pairCreatedAt: string | null;
  /** Our overall verdict when we have checked the token. */
  level: RiskLevel | null;
};

export type CloneSummary = {
  ticker: string;
  /** Tokens using the ticker, the current one included. */
  total: number;
  /** 1 = deepest liquidity among them. */
  rank: number;
  state: "largest" | "smaller";
  largest: CloneCandidate | null;
  others: CloneCandidate[];
};

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKC").toLowerCase().replace(/^\$/, "").replace(/\s+/g, "");

export function isTickerClone(
  current: { symbol: string | null; name: string | null },
  c: { symbol: string | null; name: string | null },
): boolean {
  const t = norm(current.symbol);
  if (t && norm(c.symbol) === t) return true;
  const n = norm(current.name);
  return n.length >= 3 && norm(c.name) === n;
}

export function summarizeClones(
  current: CloneCandidate,
  candidates: CloneCandidate[],
  sameAddress: (a: string, b: string) => boolean,
  limit = 8,
): CloneSummary | null {
  if (!current.symbol) return null;
  const byAddress = new Map<string, CloneCandidate>();
  for (const c of candidates) {
    if (sameAddress(c.address, current.address) || !isTickerClone(current, c)) continue;
    const key = c.address.toLowerCase();
    const prev = byAddress.get(key);
    if (!prev || (c.liquidityUsd ?? 0) > (prev.liquidityUsd ?? 0))
      byAddress.set(key, { ...c, level: c.level ?? prev?.level ?? null });
    else if (!prev.level && c.level) byAddress.set(key, { ...prev, level: c.level });
  }
  const others = [...byAddress.values()].sort(
    (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
  );
  if (!others.length) return null;
  const mine = current.liquidityUsd ?? 0;
  const bigger = others.filter((o) => (o.liquidityUsd ?? 0) > mine);
  return {
    ticker: current.symbol,
    total: others.length + 1,
    rank: bigger.length + 1,
    state: bigger.length ? "smaller" : "largest",
    largest: bigger[0] ?? null,
    others: others.slice(0, limit),
  };
}
