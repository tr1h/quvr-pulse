import type { RiskLevel } from "@quvr/shared";
import type { RugFlagId, RugReportSummary } from "./rug-report";
import { xLength, X_LIMIT } from "./share";

/**
 * Ready-to-post drafts for @quvrpulse (copied by hand from the admin page, never auto-posted).
 * Same wording rules as the site: facts only, no "safe", no buy/sell calls, NFA.
 */

export const FLAG_EN: Record<RugFlagId, string> = {
  "contract-control": "owner still controls the contract",
  concentrated: "top holders own most of the supply",
  "deployer-share": "creator holds a big share",
  "deployer-selling": "creator is selling",
  clusters: "possibly related wallets hold a notable share",
  "thin-liquidity": "thin liquidity",
  "price-impact": "a small sell moves the price a lot",
  "mass-transfers": "mass token distributions",
};

const LEVEL_EN: Record<RiskLevel, string> = {
  high: "High risk",
  elevated: "Elevated risk",
  low: "Low detected risk",
  insufficient: "Insufficient data",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "Robinhood Chain, last 24h" statistics post. null when there is too little to say. */
export function dailyStatsPost(s: RugReportSummary, chainName: string, url: string): string | null {
  if (s.total < 10) return null;
  const lines = [
    `${chainName}, last 24h on @quvrpulse:`,
    "",
    `• ${s.total} tokens checked`,
    `• ${pct(s.verdicts.high / s.total)} High risk, ${pct(s.verdicts.elevated / s.total)} Elevated`,
  ];
  const top = s.flags.filter((f) => f.count > 0).slice(0, 2);
  if (top.length)
    lines.push(
      `• Top red flags: ${top.map((f) => `${FLAG_EN[f.id]} (${pct(f.share)})`).join(", ")}`,
    );
  if (s.medianTop10 !== null) lines.push(`• Median top-10 holders: ${pct(s.medianTop10)}`);
  const tail = ["", url, "NFA"];
  while (lines.length > 3 && xLength([...lines, ...tail].join("\n"), url) > X_LIMIT) lines.pop();
  return [...lines, ...tail].join("\n");
}

export type Autopsy = {
  symbol: string | null;
  address: string;
  chainName: string;
  verdict: RiskLevel;
  flags: RugFlagId[];
  top10: number | null;
  /** When we first checked the token (label recorded). */
  capturedAt: string;
  /** When the outcome was observed. */
  observedAt: string;
  status: "dead" | "no_market";
  priceRatio: number | null;
  liquidityRatio: number | null;
};

function hoursBetween(a: string, b: string): string {
  const h = (Date.parse(b) - Date.parse(a)) / 3_600_000;
  return h < 1.5 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.round(h)}h`;
}

/** "We flagged it, here is what happened" post. Facts only: what we saw, then what changed. */
export function autopsyPost(a: Autopsy, url: string): string {
  const name = a.symbol ? `$${a.symbol}` : "This token";
  const time = new Date(a.capturedAt).toISOString().slice(11, 16);
  const what =
    a.status === "no_market"
      ? "no market left"
      : [
          a.liquidityRatio !== null && a.liquidityRatio <= 0.1
            ? `liquidity −${Math.round((1 - a.liquidityRatio) * 100)}%`
            : null,
          a.priceRatio !== null && a.priceRatio <= 0.1
            ? `price −${Math.round((1 - a.priceRatio) * 100)}%`
            : null,
        ]
          .filter(Boolean)
          .join(", ") || "down 90%+";
  const facts = a.flags.map((f) => FLAG_EN[f]);
  if (a.top10 !== null && !a.flags.includes("concentrated"))
    facts.push(`top-10 wallets hold ${pct(a.top10)}`);
  const head = [
    `${name} on ${a.chainName}`,
    "",
    `Our check at ${time} UTC: ${LEVEL_EN[a.verdict]}`,
  ];
  const tail = ["", `${hoursBetween(a.capturedAt, a.observedAt)} later: ${what}.`, "", url, "NFA"];
  const lines: string[] = [];
  for (const f of facts) {
    const next = [...head, ...lines, `• ${f}`, ...tail].join("\n");
    if (xLength(next, url) > X_LIMIT) break;
    lines.push(`• ${f}`);
  }
  return [...head, ...lines, ...tail].join("\n");
}
