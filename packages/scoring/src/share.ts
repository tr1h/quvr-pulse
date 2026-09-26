import type { RiskLevel, TokenReport } from "@quvr/shared";
import { verdictLevel } from "./verdict";

/**
 * Ready-to-post text for X built from a report: the most important verifiable facts first,
 * as many as fit into one post. Wording rules: facts only, no "safe"/"scam", no buy/sell calls,
 * wallet links are "possibly linked", always NFA.
 */
export const X_LIMIT = 280;
/** X counts every link as 23 characters regardless of its length. */
const X_URL_LEN = 23;

const LEVEL_EN: Record<RiskLevel, string> = {
  low: "Low detected risk",
  elevated: "Elevated risk",
  high: "High risk",
  insufficient: "Insufficient data",
};

const RISKY_CAPS = new Set([
  "mint",
  "pause",
  "blacklist",
  "fee-change",
  "balance-modify",
  "transfer-restriction",
  "trading-toggle",
  "upgrade",
  "selfdestruct",
]);

const pct = (v: number) => `${v >= 0.1 ? Math.round(v * 100) : Math.round(v * 1000) / 10}%`;

function age(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Facts in priority order (most decision-relevant first). */
export function shareFacts(r: TokenReport): string[] {
  const facts: string[] = [];
  const codes = new Set(r.findings.map((f) => f.code));
  const c = r.contract.value;

  // Contract powers.
  if (r.chainFamily === "solana") {
    const live = [
      codes.has("solana.mint-authority") && "mint authority",
      codes.has("solana.freeze-authority") && "freeze authority",
      codes.has("solana.permanent-delegate") && "permanent delegate",
      codes.has("solana.transfer-hook") && "transfer hook",
    ].filter(Boolean) as string[];
    if (live.length) facts.push(`⚠ ${live.join(" + ")} still active`);
    else if (codes.has("solana.authorities-revoked")) facts.push("mint & freeze revoked");
  } else if (c) {
    const risky = c.capabilities.filter((x) => x.present && RISKY_CAPS.has(x.id)).map((x) => x.id);
    const ownerGone = c.owner.kind === "renounced" || c.owner.kind === "none";
    if (risky.length && !ownerGone) facts.push(`⚠ owner can: ${risky.slice(0, 3).join(", ")}`);
    else if (c.proxy.isProxy && c.proxy.kind !== "eip1167") facts.push("⚠ upgradeable proxy");
    else if (ownerGone) facts.push("no owner powers found");
  }

  // Creator.
  if (codes.has("distribution.deployer-selling")) facts.push("⚠ creator selling in last 24h");
  const dep = r.distribution.deployerShare.value;
  if (dep !== null && dep >= 0.05) facts.push(`creator holds ${pct(dep)} of supply`);

  // Holders.
  const top10 = r.distribution.concentration.value?.top10 ?? null;
  if (top10 !== null) facts.push(`top-10 hold ${pct(top10)} (pools excluded)`);
  const clusters = (r.distribution.clusters.value ?? []).filter((x) => x.confidence !== "low");
  if (clusters.length)
    facts.push(
      `${clusters.length} group${clusters.length > 1 ? "s" : ""} of possibly linked wallets`,
    );

  // Liquidity.
  const liqRatio = r.liquidity.liquidityToMcap.value;
  if (liqRatio !== null && liqRatio < 0.03) facts.push(`liquidity only ${pct(liqRatio)} of mcap`);
  const impact = (r.liquidity.priceImpact.value ?? []).find((x) => x.usd === 1000);
  if (impact && impact.impactPct >= 0.05)
    facts.push(`$1k sell moves price ~${Math.round(impact.impactPct * 100)}%`);
  const poolAge = r.liquidity.poolAgeHours.value;
  if (poolAge !== null && poolAge < 24) facts.push(`pool ${age(poolAge)} old`);
  const h1 = r.market.priceChange.value?.h1 ?? null;
  if (h1 !== null && Math.abs(h1) >= 50) facts.push(`${h1 > 0 ? "+" : ""}${Math.round(h1)}% in 1h`);

  return facts;
}

/** Length as X counts it (links = 23 chars, emoji counted by code point is close enough). */
export function xLength(text: string, url: string): number {
  return [...text.replace(url, "")].length + X_URL_LEN;
}

export function shareText(r: TokenReport, url: string): string {
  const name = r.token.symbol.value ? `$${r.token.symbol.value}` : "This token";
  const level = verdictLevel([
    r.scores.contractSafety.level,
    r.scores.liquidityHealth.level,
    r.scores.distributionHealth.level,
  ] as RiskLevel[]);
  // Mentioning the account puts every shared check in @quvrpulse's notifications.
  const head = `${name} on @quvrpulse:`;
  const tail = `Verdict: ${LEVEL_EN[level]}\n${url}\nNFA`;
  const lines: string[] = [];
  for (const f of shareFacts(r)) {
    const candidate = [head, ...lines, `• ${f}`, tail].join("\n");
    if (xLength(candidate, url) > X_LIMIT) break;
    lines.push(`• ${f}`);
  }
  return [head, ...lines, tail].join("\n");
}
