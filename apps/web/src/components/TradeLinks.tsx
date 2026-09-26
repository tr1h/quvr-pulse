import type { Locale, TokenReport } from "@quvr/shared";
import { TrackedLink } from "@/components/TrackedLink";
import { tx } from "@/lib/i18n";
import { tradeLinks } from "@/lib/trade-links";

export function TradeLinks({ r, locale }: { r: TokenReport; locale: Locale }) {
  const links = tradeLinks(r);
  if (!links.length) return null;
  return (
    <p
      className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
      data-testid="trade-links"
    >
      <span className="text-dim">
        {tx(locale, {
          ru: "Обмен:",
          en: "Swap on:",
          de: "Tauschen auf:",
          es: "Intercambiar en:",
          zh: "兑换：",
        })}
      </span>
      {links.map((l) => (
        <TrackedLink
          key={l.label}
          event="trade_out"
          href={l.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-muted underline decoration-dotted hover:text-signal"
        >
          {l.label} ↗
        </TrackedLink>
      ))}
      <span className="text-xs text-dim">
        {tx(locale, {
          ru: "внешний сайт · QUVR не проводит сделки и не берёт комиссию",
          en: "external site · QUVR does not execute trades or take fees",
          de: "externe Seite · QUVR führt keine Trades aus und nimmt keine Gebühren",
          es: "sitio externo · QUVR no ejecuta operaciones ni cobra comisiones",
          zh: "外部网站 · QUVR 不执行交易，也不收取费用",
        })}
      </span>
    </p>
  );
}
