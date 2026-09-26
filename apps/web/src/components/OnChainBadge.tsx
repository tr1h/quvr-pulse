import Link from "next/link";
import { onChainLabel } from "@quvr/services";
import type { Locale, TokenReport } from "@quvr/shared";
import { makeT, tx } from "@/lib/i18n";

const LEVEL_KEY = { 1: "low", 2: "elevated", 3: "high", 4: "insufficient" } as const;
const LEVEL_COLOR = {
  1: "var(--color-risk-low)",
  2: "var(--color-risk-elevated)",
  3: "var(--color-risk-high)",
  4: "var(--color-risk-none)",
} as const;
const EXPLORER = "https://robinhoodchain.blockscout.com";

function utc(iso: string, locale: Locale): string {
  const intl = { ru: "ru-RU", en: "en-US", de: "de-DE", es: "es-ES", zh: "zh-CN" }[locale];
  return `${new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso))} UTC`;
}

/**
 * "Recorded on-chain" block: the token's label as stored in QuvrRiskOracle on Robinhood Chain,
 * with the permanent first-label / first-High timestamps and links to verify them.
 */
export async function OnChainBadge({ r, locale }: { r: TokenReport; locale: Locale }) {
  if (r.chainId !== 4663) return null;
  const a = await onChainLabel(r.address);
  if (!a) return null;
  const t = makeT(locale);
  const L = (ru: string, en: string, de: string, es: string, zh: string) =>
    tx(locale, { ru, en, de, es, zh });
  const level = a.level as keyof typeof LEVEL_KEY;
  return (
    <section
      className="rounded border border-risk-low/40 bg-risk-low/5 px-4 py-3 text-sm"
      data-testid="onchain-badge"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-risk-low">
          ⛓{" "}
          {L(
            "Оценка записана в блокчейн Robinhood Chain",
            "Label recorded on Robinhood Chain",
            "Urteil auf Robinhood Chain gespeichert",
            "Etiqueta registrada en Robinhood Chain",
            "风险标签已记录在 Robinhood Chain 链上",
          )}
        </span>
        <span
          className="rounded-sm border px-1.5 py-0.5 text-xs"
          style={{ borderColor: LEVEL_COLOR[level], color: LEVEL_COLOR[level] }}
        >
          {t(`lvl_${LEVEL_KEY[level] ?? "insufficient"}`)}
        </span>
      </div>
      <p className="mt-1 text-muted">
        {a.firstHighAt
          ? L(
              `«Высокий риск» впервые записан ${utc(a.firstHighAt, locale)}. Эту запись нельзя изменить задним числом.`,
              `“High risk” was first recorded ${utc(a.firstHighAt, locale)}. This record cannot be changed afterwards.`,
              `„Hohes Risiko“ erstmals gespeichert am ${utc(a.firstHighAt, locale)}. Dieser Eintrag ist nachträglich nicht änderbar.`,
              `«Riesgo alto» registrado por primera vez el ${utc(a.firstHighAt, locale)}. Este registro no se puede cambiar después.`,
              `“高风险”首次记录于 ${utc(a.firstHighAt, locale)}，该记录事后无法更改。`,
            )
          : L(
              `Впервые записано ${utc(a.firstLabeledAt, locale)}, обновлений: ${a.labelCount}. Историю нельзя изменить задним числом.`,
              `First recorded ${utc(a.firstLabeledAt, locale)}, updates: ${a.labelCount}. The history cannot be changed afterwards.`,
              `Erstmals gespeichert am ${utc(a.firstLabeledAt, locale)}, Updates: ${a.labelCount}. Der Verlauf ist nachträglich nicht änderbar.`,
              `Registrado por primera vez el ${utc(a.firstLabeledAt, locale)}, actualizaciones: ${a.labelCount}. El historial no se puede cambiar después.`,
              `首次记录于 ${utc(a.firstLabeledAt, locale)}，更新次数：${a.labelCount}。历史记录事后无法更改。`,
            )}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        {a.tx && (
          <a
            href={`${EXPLORER}/tx/${a.tx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-signal underline decoration-dotted"
          >
            {L("Транзакция", "Transaction", "Transaktion", "Transacción", "交易")} ↗
          </a>
        )}
        <a
          href={`${EXPLORER}/address/${a.oracle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-signal underline decoration-dotted"
        >
          {L("Контракт", "Contract", "Contract", "Contrato", "合约")} ↗
        </a>
        <Link href="/oracle" className="text-muted underline decoration-dotted hover:text-signal">
          {L("Что это?", "What is this?", "Was ist das?", "¿Qué es esto?", "这是什么？")}
        </Link>
      </p>
    </section>
  );
}
