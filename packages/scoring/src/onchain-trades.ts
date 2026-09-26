/**
 * Reconstruction of a wallet's trades from on-chain token movements.
 *
 * Each leg is one token movement of the wallet in one transaction. A leg is "priced" when it
 * was matched to a DEX swap in the same transaction (quote = ETH-equivalent amount paid or
 * received). Unpriced movements (airdrops, wallet-to-wallet moves, bonding-curve trades we
 * cannot price) make a position "tainted": it is reported but excluded from quality stats,
 * because its cost basis is unknown.
 */
export type WalletLeg = {
  token: string;
  direction: "in" | "out";
  /** Token amount in token units (decimals applied). */
  amount: number;
  /** ETH-equivalent paid (buy) or received (sell); null when not priced by a swap. */
  quote: number | null;
  timestamp: number; // ms
  txHash: string;
};

export type OnchainClosedTrade = {
  token: string;
  costQuote: number;
  proceedsQuote: number;
  pnlQuote: number;
  roi: number;
  openedAt: number;
  closedAt: number;
  holdSeconds: number;
};

export type OnchainOpenPosition = {
  token: string;
  amount: number;
  costQuote: number;
  openedAt: number;
  tainted: boolean;
};

export type ReconstructionResult = {
  closed: OnchainClosedTrade[];
  open: OnchainOpenPosition[];
  /** Round trips excluded because part of the position had no swap price. */
  taintedClosed: number;
  /** Sells of tokens bought before the observed window (cost unknown). */
  sellsWithoutHistory: number;
};

/** A position is closed when at most this share of its peak size remains (dust). */
const DUST_SHARE = 0.01;

type State = {
  qty: number;
  cost: number;
  peak: number;
  bought: number;
  proceeds: number;
  realized: number;
  openedAt: number;
  tainted: boolean;
};

export function reconstructTrades(legs: WalletLeg[]): ReconstructionResult {
  const sorted = [...legs].sort((a, b) => a.timestamp - b.timestamp);
  const byToken = new Map<string, State>();
  const closed: OnchainClosedTrade[] = [];
  let taintedClosed = 0;
  let sellsWithoutHistory = 0;

  const fresh = (t: number): State => ({
    qty: 0,
    cost: 0,
    peak: 0,
    bought: 0,
    proceeds: 0,
    realized: 0,
    openedAt: t,
    tainted: false,
  });

  for (const leg of sorted) {
    if (!(leg.amount > 0)) continue;
    let s = byToken.get(leg.token);
    if (leg.direction === "in") {
      if (!s || s.qty <= 0) s = fresh(leg.timestamp);
      s.qty += leg.amount;
      s.peak = Math.max(s.peak, s.qty);
      if (leg.quote !== null && leg.quote > 0) {
        s.cost += leg.quote;
        s.bought += leg.quote;
      } else s.tainted = true;
      byToken.set(leg.token, s);
      continue;
    }
    // out
    if (!s || s.qty <= 0) {
      if (leg.quote !== null) sellsWithoutHistory++;
      continue;
    }
    const sold = Math.min(leg.amount, s.qty);
    const fraction = sold / s.qty;
    const costPart = s.cost * fraction;
    if (leg.quote !== null) {
      s.proceeds += leg.quote * (sold / leg.amount);
      s.realized += leg.quote * (sold / leg.amount) - costPart;
    } else {
      s.tainted = true; // moved out without a price
    }
    s.cost -= costPart;
    s.qty -= sold;
    if (s.qty <= s.peak * DUST_SHARE) {
      if (s.tainted || s.bought <= 0) taintedClosed++;
      else {
        closed.push({
          token: leg.token,
          costQuote: s.bought,
          proceedsQuote: s.proceeds,
          pnlQuote: s.realized,
          roi: s.realized / s.bought,
          openedAt: s.openedAt,
          closedAt: leg.timestamp,
          holdSeconds: Math.max(0, (leg.timestamp - s.openedAt) / 1000),
        });
      }
      byToken.delete(leg.token);
    } else byToken.set(leg.token, s);
  }

  const open: OnchainOpenPosition[] = [...byToken.entries()]
    .filter(([, s]) => s.qty > 0)
    .map(([token, s]) => ({
      token,
      amount: s.qty,
      costQuote: s.cost,
      openedAt: s.openedAt,
      tainted: s.tainted,
    }));
  return { closed, open, taintedClosed, sellsWithoutHistory };
}

/**
 * How quickly an author sells after publishing a thesis on a token: seconds from each thesis to
 * the first sell of that token (only theses followed by a sell). Median, or null.
 */
export function medianSellAfterThesis(
  theses: Array<{ token: string; publishedAt: number }>,
  legs: WalletLeg[],
): number | null {
  const delays: number[] = [];
  for (const th of theses) {
    const sell = legs
      .filter((l) => l.token === th.token && l.direction === "out" && l.timestamp >= th.publishedAt)
      .sort((a, b) => a.timestamp - b.timestamp)[0];
    if (sell) delays.push((sell.timestamp - th.publishedAt) / 1000);
  }
  if (!delays.length) return null;
  delays.sort((a, b) => a - b);
  const mid = Math.floor(delays.length / 2);
  return delays.length % 2 ? delays[mid]! : (delays[mid - 1]! + delays[mid]!) / 2;
}
