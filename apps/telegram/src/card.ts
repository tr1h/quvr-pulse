import { shareFacts, verdictLevel, type CloneSummary } from "@quvr/scoring";
import {
  escapeHtml,
  formatUsd,
  parseTokenRef,
  shortAddress,
  type RiskLevel,
  type TokenReport,
} from "@quvr/shared";

/**
 * Compact report card for group chats and inline mode. English (the shared language of crypto
 * chats), facts only — same wording rules as the site: no "safe", no buy/sell calls, NFA.
 */
const EVM = /\b0x[0-9a-fA-F]{40}\b/g;
const SOLANA = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

/** First token address in a chat message (EVM before Solana), validated like the site does. */
export function extractTokenRef(
  text: string,
): { chain: "robinhood" | "solana"; address: string } | null {
  for (const re of [EVM, SOLANA]) {
    for (const m of text.matchAll(re)) {
      try {
        const ref = parseTokenRef(m[0]);
        if (ref) return ref;
      } catch {
        // not an address
      }
    }
  }
  return null;
}

const LEVEL: Record<RiskLevel, string> = {
  low: "🔷 Low detected risk",
  elevated: "🟠 Elevated risk",
  high: "🔴 High risk",
  insufficient: "⚪ Insufficient data",
};

/** Verdict label without the emoji (inline result titles). */
export function levelLabel(r: TokenReport): string {
  return LEVEL[reportLevel(r)].replace(/^S+s/, "");
}

export function reportLevel(r: TokenReport): RiskLevel {
  return verdictLevel([
    r.scores.contractSafety.level,
    r.scores.liquidityHealth.level,
    r.scores.distributionHealth.level,
  ] as RiskLevel[]);
}

export function formatQuickCard(
  r: TokenReport,
  clones: CloneSummary | null,
  appUrl: string,
  maxFacts = 4,
): string {
  const e = escapeHtml;
  const sym = r.token.symbol.value ? `$${e(r.token.symbol.value)}` : e(shortAddress(r.address));
  const name = r.token.name.value ? ` ${e(r.token.name.value)}` : "";
  const facts = shareFacts(r).slice(0, maxFacts);
  const lines = [
    `<b>${sym}</b>${name} · ${e(r.chainName)}`,
    `<code>${e(r.checksumAddress)}</code>`,
    "",
    `<b>${LEVEL[reportLevel(r)]}</b>`,
    ...facts.map((f) => `• ${e(f)}`),
  ];
  if (clones?.state === "smaller") {
    lines.push(
      `• ⚠ ${clones.total} tokens use this ticker — this one is #${clones.rank} by liquidity. Check the CA.`,
    );
  } else if (clones) {
    lines.push(`• ${clones.total - 1} other tokens use this ticker (all smaller)`);
  }
  const mcap = formatUsd(r.market.marketCapUsd.value, "en");
  const liq = formatUsd(r.market.liquidityUsd.value, "en");
  if (mcap || liq)
    lines.push("", [mcap && `MCap ${mcap}`, liq && `Liq ${liq}`].filter(Boolean).join(" · "));
  lines.push(
    "",
    `<a href="${e(`${appUrl.replace(/\/$/, "")}/token/${r.address}`)}">Full report</a> · <a href="https://x.com/quvrpulse">Follow @quvrpulse</a> · NFA`,
  );
  return lines.join("\n");
}
