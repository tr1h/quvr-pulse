/**
 * On-chain author statistics for a wallet (no social-provider credits).
 * Usage: npx tsx scripts/author-stats.ts <handle> <0xWallet>
 */
import "dotenv/config";
import { loadWalletHistory, onchainAuthorStats } from "@quvr/services";
import { reconstructTrades } from "@quvr/scoring";
import { normalizeAddress } from "@quvr/shared";

const handle = process.argv[2] ?? "unknown";
const wallet = normalizeAddress(process.argv[3] ?? "");
const t0 = Date.now();
const h = await loadWalletHistory(wallet);
const rec = reconstructTrades(h.legs);
console.log(
  `legs ${h.legs.length} (priced ${h.legs.filter((l) => l.quote !== null).length}) complete=${h.complete} · closed ${rec.closed.length} · open ${rec.open.length} · excluded ${rec.taintedClosed} · sells w/o history ${rec.sellsWithoutHistory} · ${Date.now() - t0} ms`,
);
for (const c of rec.closed.slice(-5)) {
  console.log(
    `  ${c.token.slice(0, 10)} cost $${c.costQuote.toFixed(2)} → $${c.proceedsQuote.toFixed(2)} pnl $${c.pnlQuote.toFixed(2)} roi ${(c.roi * 100).toFixed(1)}% hold ${(c.holdSeconds / 3600).toFixed(1)}h`,
  );
}
const s = await onchainAuthorStats(handle, wallet, []);
console.log(JSON.stringify(s, null, 1));
process.exit(0);
