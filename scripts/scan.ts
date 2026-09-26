/**
 * CLI scan: prints a compact summary of the full report for a token.
 * Usage: npm run scan -- 0x4b7d1e5ec6889e63e70d39561edf925095dbed88 [--json]
 */
import "dotenv/config";
import { buildSolanaTokenReport, buildTokenReport, resolveTokenChain } from "@quvr/services";
import { parseTokenRef, type SourcedValue } from "@quvr/shared";

const ref = parseTokenRef(process.argv[2] ?? "0x4b7d1e5ec6889e63e70d39561edf925095dbed88");
if (!ref) throw new Error("invalid address");
const token = ref.address;
const t0 = Date.now();
const { report } =
  ref.chain === "solana"
    ? await buildSolanaTokenReport(token)
    : await buildTokenReport(token, null, { chainId: await resolveTokenChain(token) });

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const show = (label: string, v: SourcedValue<unknown>) =>
  console.log(
    `${label.padEnd(22)} ${v.value === null ? `Нет данных (${v.error ?? "?"})` : typeof v.value === "object" ? JSON.stringify(v.value).slice(0, 160) : String(v.value)}  [${v.source}, ${v.confidence}${v.approximate ? ", approx" : ""}${v.isStale ? ", STALE" : ""}]`,
  );

console.log(
  `\n${report.token.name.value} (${report.token.symbol.value}) ${report.checksumAddress} — ${report.chainName} #${report.chainId}, mode ${report.mode}, ${Date.now() - t0} ms\n`,
);
show("block", report.blockNumber);
show("price USD", report.market.priceUsd);
show("market cap", report.market.marketCapUsd);
show("liquidity", report.market.liquidityUsd);
show("volume", report.market.volume);
show("creation", report.creation);
show("simulation", report.simulation);
show("holders", report.distribution.holdersCount);
show("concentration", report.distribution.concentration);
show("deployer share", report.distribution.deployerShare);
show("related share", report.distribution.relatedShare);
show("holder growth", report.distribution.holderGrowth);
show("fresh share", report.distribution.freshWalletShare);
show("mass transfers", report.distribution.massTransfers);
show("excluded", report.distribution.excluded);
show("net flow", report.liquidity.netFlowNative);
show("price impact", report.liquidity.priceImpact);
show("liq/mcap", report.liquidity.liquidityToMcap);
show("price history", {
  ...report.history.price,
  value: report.history.price.value ? `${report.history.price.value.length} points` : null,
});
show("theses", report.social.theses);
console.log(
  "\nContract:",
  JSON.stringify(
    {
      owner: report.contract.value?.owner,
      proxy: report.contract.value?.proxy,
      caps: report.contract.value?.capabilities.filter((c) => c.present),
      fees: report.contract.value?.feeReadings,
    },
    null,
    1,
  ).slice(0, 2500),
);
console.log("\nScores:");
for (const s of Object.values(report.scores))
  console.log(
    `  ${s.key.padEnd(20)} ${String(s.value ?? "—").padStart(3)}  ${s.level.padEnd(12)} conf=${s.confidence} cov=${s.coverage}  ${s.reasons.map((r) => r.text.ru).join(" | ")}`,
  );
console.log("\nFindings:");
for (const f of report.findings)
  console.log(`  [${f.severity}] ${f.title.ru} — ${f.evidence.slice(0, 2).join("; ")}`);
console.log("\nTimeline:");
for (const e of report.timeline) console.log(`  ${e.at ?? "?"}  ${e.title.ru}`);
process.exit(0);
