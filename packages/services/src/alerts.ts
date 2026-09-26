import { getDb, toJson } from "@quvr/db";
import {
  escapeHtml,
  logger,
  serverEnv,
  type LocalizedText,
  type Severity,
  type TokenReport,
} from "@quvr/shared";
import { safeDb } from "./persistence";
import { sendTelegramMessage } from "./telegram-send";

export type AlertCandidate = {
  kind: string;
  severity: Severity;
  dedupeKey: string;
  title: LocalizedText;
  body: LocalizedText;
  /** Numeric magnitude compared against the rule threshold (percent, USD, count). */
  magnitude?: number;
};

const tt = (ru: string, en: string): LocalizedText => ({ ru, en });

/** Pure diff of two reports → alert candidates. Missing data never triggers an alert. */
export function evaluateAlerts(
  prev: TokenReport | null,
  next: TokenReport,
  now = Date.now(),
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const sym = next.token.symbol.value ?? next.checksumAddress.slice(0, 8);

  // Deployer started selling (new sell txs since the previous report).
  const prevSells = new Set(
    (prev?.deployerActions.value ?? []).filter((a) => a.kind === "sell").map((a) => a.txHash),
  );
  for (const a of (next.deployerActions.value ?? []).filter(
    (x) => x.kind === "sell" && !prevSells.has(x.txHash),
  )) {
    if (!prev) break; // first observation: history, not news
    out.push({
      kind: "deployer-sell",
      severity: "high",
      dedupeKey: `deployer-sell:${a.txHash}`,
      title: tt(`${sym}: deployer продаёт`, `${sym}: deployer is selling`),
      body: tt(
        `Deployer отправил ${a.amount?.toFixed(2) ?? "?"} токенов в пул. tx ${a.txHash}`,
        `Deployer sent ${a.amount?.toFixed(2) ?? "?"} tokens to a pool. tx ${a.txHash}`,
      ),
    });
  }

  // Liquidity drop within the last hour of snapshots.
  const hist = next.history.liquidity.value ?? [];
  const cur = next.market.liquidityUsd.value;
  const hourAgo = hist.filter((p) => p.t >= now - 3_600_000);
  if (cur !== null && !next.market.liquidityUsd.isStale && hourAgo.length >= 2) {
    const peak = Math.max(...hourAgo.map((p) => p.liquidityUsd));
    if (peak > 0) {
      const dropPct = ((peak - cur) / peak) * 100;
      if (dropPct > 0) {
        out.push({
          kind: "liquidity-drop",
          severity: dropPct > 50 ? "critical" : "high",
          dedupeKey: `liquidity-drop:${Math.floor(now / 3_600_000)}`,
          magnitude: dropPct,
          title: tt(
            `${sym}: ликвидность −${dropPct.toFixed(1)}%`,
            `${sym}: liquidity −${dropPct.toFixed(1)}%`,
          ),
          body: tt(
            `За час ликвидность снизилась с $${Math.round(peak)} до $${Math.round(cur)}.`,
            `Liquidity fell from $${Math.round(peak)} to $${Math.round(cur)} within an hour.`,
          ),
        });
      }
    }
  }

  // Large sells (on-chain v4 swaps).
  const prevLarge = new Set(
    (prev?.timeline ?? []).filter((e) => e.kind === "large-sell").map((e) => e.txHash),
  );
  for (const e of next.timeline.filter(
    (x) => x.kind === "large-sell" && x.txHash && !prevLarge.has(x.txHash),
  )) {
    if (!prev) break;
    const usd = Number(/\$(\d+)/.exec(e.title.en)?.[1] ?? "0");
    out.push({
      kind: "large-sell",
      severity: "medium",
      dedupeKey: `large-sell:${e.txHash}`,
      magnitude: usd,
      title: tt(`${sym}: крупная продажа ≈ $${usd}`, `${sym}: large sell ≈ $${usd}`),
      body: tt(`tx ${e.txHash}`, `tx ${e.txHash}`),
    });
  }

  // Privileged state changes (owner / implementation / fee readings).
  const pc = prev?.contract.value;
  const nc = next.contract.value;
  if (pc && nc && !next.contract.isStale) {
    const changes: string[] = [];
    if (pc.owner.address !== nc.owner.address)
      changes.push(`owner ${pc.owner.address} → ${nc.owner.address}`);
    if (pc.proxy.implementation !== nc.proxy.implementation)
      changes.push(`implementation ${pc.proxy.implementation} → ${nc.proxy.implementation}`);
    const fees = (c: typeof nc) => JSON.stringify(c.feeReadings);
    if (fees(pc) !== fees(nc)) changes.push(`fees ${fees(pc)} → ${fees(nc)}`);
    if (changes.length) {
      out.push({
        kind: "privilege-change",
        severity: "high",
        dedupeKey: `privilege:${changes.join("|")}`.slice(0, 180),
        title: tt(
          `${sym}: изменено привилегированное состояние`,
          `${sym}: privileged state changed`,
        ),
        body: tt(changes.join("; "), changes.join("; ")),
      });
    }
  }

  // Social: new quality thesis / quality cluster / author exit.
  const prevTheses = new Set((prev?.social.theses.value ?? []).map((t) => t.id));
  const authors = new Map(
    (next.social.authors.value ?? []).map((a) => [a.handle.toLowerCase(), a]),
  );
  const newQuality = (next.social.theses.value ?? []).filter(
    (t) =>
      !prevTheses.has(t.id) && authors.get(t.authorHandle.toLowerCase())?.qualityTier === "high",
  );
  if (prev) {
    for (const th of newQuality) {
      out.push({
        kind: "quality-thesis",
        severity: "info",
        dedupeKey: `thesis:${th.id}`,
        title: tt(
          `${sym}: новый тезис от @${th.authorHandle}`,
          `${sym}: new thesis by @${th.authorHandle}`,
        ),
        body: tt(th.text.slice(0, 280), th.text.slice(0, 280)),
      });
    }
  }
  const recentQualityAuthors = new Set(
    (next.social.theses.value ?? [])
      .filter(
        (t) =>
          now - Date.parse(t.createdAt) < 3_600_000 &&
          authors.get(t.authorHandle.toLowerCase())?.qualityTier === "high",
      )
      .map((t) => t.authorHandle.toLowerCase()),
  );
  if (recentQualityAuthors.size >= 2) {
    out.push({
      kind: "quality-cluster",
      severity: "info",
      dedupeKey: `cluster:${[...recentQualityAuthors].sort().join(",")}`,
      magnitude: recentQualityAuthors.size,
      title: tt(
        `${sym}: ${recentQualityAuthors.size} качественных автора за час`,
        `${sym}: ${recentQualityAuthors.size} quality authors within an hour`,
      ),
      body: tt(
        [...recentQualityAuthors].map((h) => `@${h}`).join(", "),
        [...recentQualityAuthors].map((h) => `@${h}`).join(", "),
      ),
    });
  }
  const prevExits = new Set(
    (prev?.timeline ?? []).filter((e) => e.kind === "author-exit").map((e) => e.title.en),
  );
  for (const e of next.timeline.filter(
    (x) => x.kind === "author-exit" && !prevExits.has(x.title.en),
  )) {
    if (!prev) break;
    out.push({
      kind: "author-exit",
      severity: "medium",
      dedupeKey: `exit:${e.title.en}`,
      title: tt(`${sym}: ${e.title.ru}`, `${sym}: ${e.title.en}`),
      body: tt(e.title.ru, e.title.en),
    });
  }

  // Sell simulation turned negative.
  const ps = prev?.simulation.value?.status;
  const ns = next.simulation.value?.status;
  if (ns === "failed" && ps !== "failed" && !next.simulation.isStale) {
    out.push({
      kind: "sell-sim-failed",
      severity: "critical",
      dedupeKey: `sim-failed:${next.simulation.value?.blockNumber ?? next.generatedAt}`,
      title: tt(`${sym}: симуляция продажи не прошла`, `${sym}: sell simulation failed`),
      body: tt(
        next.simulation.value?.sell?.detail ?? "",
        next.simulation.value?.sell?.detail ?? "",
      ),
    });
  }
  return out;
}

function passesThreshold(kind: string, threshold: number | null, magnitude?: number) {
  if (threshold === null || magnitude === undefined) return true;
  return magnitude >= threshold;
}

/** Stores alert events per matching rule (deduplicated) and delivers Telegram notifications. */
export async function dispatchAlerts(token: string, candidates: AlertCandidate[]): Promise<number> {
  if (!candidates.length) return 0;
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL;
  const botEnabled = !!serverEnv().TELEGRAM_BOT_TOKEN;
  return safeDb(
    "dispatchAlerts",
    async () => {
      const db = getDb();
      const rules = await db.alertRule.findMany({
        where: {
          enabled: true,
          kind: { in: candidates.map((c) => c.kind) },
          watchlist: { tokenAddress: token },
        },
        include: { watchlist: true },
      });
      let delivered = 0;
      for (const c of candidates) {
        for (const rule of rules.filter(
          (r) => r.kind === c.kind && passesThreshold(c.kind, r.threshold, c.magnitude),
        )) {
          let created;
          try {
            created = await db.alertEvent.create({
              data: {
                ruleId: rule.id,
                tokenAddress: token,
                kind: c.kind,
                severity: c.severity,
                title: toJson(c.title),
                body: toJson(c.body),
                dedupeKey: c.dedupeKey,
              },
            });
          } catch {
            continue; // duplicate (ruleId, dedupeKey) → already alerted
          }
          if (rule.watchlist.ownerType === "telegram" && botEnabled) {
            const html = `<b>${escapeHtml(c.title.ru)}</b>\n${escapeHtml(c.body.ru)}\n<a href="${escapeHtml(`${appUrl}/token/${token}`)}">Отчёт QUVR Pulse</a>`;
            try {
              await sendTelegramMessage(rule.watchlist.ownerId, html);
              await db.alertEvent.update({
                where: { id: created.id },
                data: { deliveredAt: new Date() },
              });
              delivered++;
            } catch (e) {
              await db.alertEvent.update({
                where: { id: created.id },
                data: { deliveryError: (e as Error).message.slice(0, 300) },
              });
              logger.warn("telegram delivery failed", { token, kind: c.kind });
            }
          }
        }
      }
      return delivered;
    },
    0,
  );
}
