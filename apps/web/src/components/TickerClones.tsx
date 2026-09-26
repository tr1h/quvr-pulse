import Link from "next/link";
import { tickerClones } from "@quvr/services";
import { formatAge, formatUsd, shortAddress, type Locale, type TokenReport } from "@quvr/shared";
import { makeT, tx } from "@/lib/i18n";

const LEVEL_COLOR: Record<string, string> = {
  low: "var(--color-risk-low)",
  elevated: "var(--color-risk-elevated)",
  high: "var(--color-risk-high)",
  insufficient: "var(--color-risk-none)",
};

/**
 * "Other tokens use this ticker" — protects people who searched by name. Never labels any token
 * official or fake: only whether a deeper token with the same ticker exists.
 */
export async function TickerClones({ r, locale }: { r: TokenReport; locale: Locale }) {
  const s = await tickerClones(r).catch(() => null);
  if (!s) return null;
  const t = makeT(locale);
  const n = s.total - 1;
  const ticker = `$${s.ticker}`;
  const warn = s.state === "smaller";
  const L = (ru: string, en: string, de: string, es: string, zh: string) =>
    tx(locale, { ru, en, de, es, zh });

  return (
    <section
      className="panel border-l-4 p-4"
      style={{ borderLeftColor: warn ? "var(--color-risk-high)" : "var(--color-rule)" }}
      aria-labelledby="clones"
      data-testid="ticker-clones"
      data-state={s.state}
    >
      <h2 id="clones" className="font-display text-base font-medium">
        {warn
          ? L(
              `⚠ Это не самый крупный токен с тикером ${ticker}`,
              `⚠ This is not the largest token named ${ticker}`,
              `⚠ Das ist nicht der größte Token namens ${ticker}`,
              `⚠ Este no es el token más grande llamado ${ticker}`,
              `⚠ 这不是名为 ${ticker} 的最大代币`,
            )
          : L(
              `Тикер ${ticker} используют ещё ${n} токен(ов)`,
              `${n} other token${n === 1 ? "" : "s"} use the ticker ${ticker}`,
              `${n} weitere Token nutzen den Ticker ${ticker}`,
              `Otros ${n} tokens usan el ticker ${ticker}`,
              `另有 ${n} 个代币使用 ${ticker} 这个代号`,
            )}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {warn
          ? L(
              `С этим тикером найдено ${s.total} токенов в этой сети, у этого по ликвидности место №${s.rank}. Тикер может повторить кто угодно — сверьте адрес контракта с официальным аккаунтом проекта.`,
              `We found ${s.total} tokens with this ticker on this chain; this one ranks #${s.rank} by liquidity. Anyone can copy a ticker — check the contract address against the project's official account.`,
              `Wir haben ${s.total} Tokens mit diesem Ticker auf dieser Chain gefunden; dieser liegt nach Liquidität auf Platz ${s.rank}. Jeder kann einen Ticker kopieren — gleiche die Contract-Adresse mit dem offiziellen Projektkonto ab.`,
              `Encontramos ${s.total} tokens con este ticker en esta red; este ocupa el puesto #${s.rank} por liquidez. Cualquiera puede copiar un ticker: compara la dirección del contrato con la cuenta oficial del proyecto.`,
              `在这条链上找到 ${s.total} 个使用该代号的代币，按流动性此代币排第 ${s.rank}。任何人都能复制代号——请用项目官方账号核对合约地址。`,
            )
          : L(
              "У этого токена самая глубокая ликвидность среди них, остальные меньше. Убедитесь, что адрес совпадает с тем, что публикует проект.",
              "This token has the deepest liquidity among them; the others are smaller. Make sure the address matches the one the project publishes.",
              "Dieser Token hat die tiefste Liquidität unter ihnen; die anderen sind kleiner. Stelle sicher, dass die Adresse mit der vom Projekt veröffentlichten übereinstimmt.",
              "Este token tiene la liquidez más profunda entre ellos; los demás son menores. Asegúrate de que la dirección coincide con la que publica el proyecto.",
              "此代币在其中流动性最深，其余都更小。请确认地址与项目方公布的一致。",
            )}
      </p>
      <details className="mt-2" open={warn}>
        <summary className="cursor-pointer font-mono text-xs text-muted">
          {L("Показать токены", "Show tokens", "Tokens anzeigen", "Ver tokens", "查看代币")} (
          {s.others.length}
          {n > s.others.length ? ` / ${n}` : ""})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="label text-left">
              <tr>
                <th className="py-1 pr-3">{t("address")}</th>
                <th className="py-1 pr-3 text-right">{t("liquidity")}</th>
                <th className="py-1 pr-3 text-right">{t("marketCap")}</th>
                <th className="py-1 pr-3">{t("poolAge")}</th>
                <th className="py-1">{L("Итог", "Verdict", "Urteil", "Veredicto", "结论")}</th>
              </tr>
            </thead>
            <tbody>
              {s.others.map((o) => (
                <tr key={o.address} className="border-t border-rule/60">
                  <td className="py-1.5 pr-3 font-mono">
                    <Link href={`/token/${o.address}`} className="hover:text-signal">
                      {shortAddress(o.address)}
                    </Link>{" "}
                    <span className="text-dim">{o.name ?? ""}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {formatUsd(o.liquidityUsd, locale) ?? t("noData")}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {formatUsd(o.marketCapUsd, locale) ?? t("noData")}
                  </td>
                  <td className="py-1.5 pr-3 text-muted">
                    {o.pairCreatedAt ? formatAge(o.pairCreatedAt, locale) : "—"}
                  </td>
                  <td
                    className="py-1.5"
                    style={{ color: o.level ? LEVEL_COLOR[o.level] : undefined }}
                  >
                    {o.level ? t(`lvl_${o.level}`) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
