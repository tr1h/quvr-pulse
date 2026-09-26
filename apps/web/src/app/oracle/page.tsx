import type { Metadata } from "next";
import Link from "next/link";
import { oracleInfo, oracleLog, oracleStats } from "@quvr/services";
import { formatAge, pickText, shortAddress, type LocalizedText } from "@quvr/shared";
import { makeT } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";

const L = (ru: string, en: string, de: string, es: string, zh: string): LocalizedText => ({
  ru,
  en,
  de,
  es,
  zh,
});

const TXT = {
  title: L(
    "QUVR Risk Oracle — оценки риска токенов в блокчейне Robinhood Chain",
    "QUVR Risk Oracle — token risk labels on Robinhood Chain",
    "QUVR Risk Oracle — Token-Risikourteile auf Robinhood Chain",
    "QUVR Risk Oracle — etiquetas de riesgo de tokens en Robinhood Chain",
    "QUVR Risk Oracle——Robinhood Chain 链上代币风险标签",
  ),
  description: L(
    "Наши оценки риска записываются в смарт-контракт Robinhood Chain: их может прочитать любой кошелёк, бот или контракт, а историю нельзя изменить задним числом. Плюс хук для Uniswap v4.",
    "Our risk labels are written to a Robinhood Chain smart contract: any wallet, bot or contract can read them, and the history cannot be rewritten. Plus a Uniswap v4 hook.",
    "Unsere Risikourteile werden in einen Smart Contract auf Robinhood Chain geschrieben: Jede Wallet, jeder Bot und jeder Contract kann sie lesen, und der Verlauf ist nicht nachträglich änderbar. Dazu ein Uniswap-v4-Hook.",
    "Nuestras etiquetas de riesgo se escriben en un smart contract de Robinhood Chain: cualquier wallet, bot o contrato puede leerlas y el historial no se puede reescribir. Además, un hook para Uniswap v4.",
    "我们的风险标签写入 Robinhood Chain 智能合约：任何钱包、机器人或合约都能读取，历史无法篡改。另有 Uniswap v4 钩子。",
  ),
  kicker: L("В блокчейне", "On-chain", "On-chain", "On-chain", "链上"),
  lead: L(
    "Каждые 30 минут сервер QUVR Pulse записывает оценки риска ликвидных токенов Robinhood Chain в публичный контракт. Любой может их прочитать и проверить, а дату первой оценки и первого «высокого риска» нельзя изменить — это доказательство, что предупреждение было до того, что случилось дальше.",
    "Every 30 minutes the QUVR Pulse server writes risk labels of liquid Robinhood Chain tokens to a public contract. Anyone can read and verify them, and the first-label and first-“High” timestamps can never change — proof that a warning existed before whatever happened next.",
    "Alle 30 Minuten schreibt der QUVR-Pulse-Server Risikourteile liquider Robinhood-Chain-Tokens in einen öffentlichen Contract. Jeder kann sie lesen und prüfen; die Zeitpunkte des ersten Urteils und des ersten „Hoch“ sind unveränderlich — Beweis, dass die Warnung vorher existierte.",
    "Cada 30 minutos el servidor de QUVR Pulse escribe etiquetas de riesgo de tokens líquidos de Robinhood Chain en un contrato público. Cualquiera puede leerlas y verificarlas; la fecha de la primera etiqueta y del primer «alto» nunca cambia: prueba de que el aviso existía antes.",
    "QUVR Pulse 服务器每 30 分钟将 Robinhood Chain 流动性代币的风险标签写入公开合约。任何人都可读取和验证；首次标签和首次“高风险”的时间永不更改——证明警告早于后续事件。",
  ),
  labels: L(
    "оценок записано",
    "labels recorded",
    "Urteile gespeichert",
    "etiquetas registradas",
    "条标签已记录",
  ),
  tokens: L("токенов", "tokens", "Tokens", "tokens", "个代币"),
  cadence: L(
    "каждые 30 мин, до 100 в день",
    "every 30 min, up to 100/day",
    "alle 30 Min., bis 100/Tag",
    "cada 30 min, hasta 100/día",
    "每 30 分钟，每天最多 100 条",
  ),
  verified: L(
    "код проверен (Sourcify)",
    "source verified (Sourcify)",
    "Quellcode verifiziert (Sourcify)",
    "código verificado (Sourcify)",
    "源码已验证（Sourcify）",
  ),
  addrH: L("Контракты", "Contracts", "Contracts", "Contratos", "合约"),
  oracle: L(
    "Оракул (оценки)",
    "Oracle (labels)",
    "Oracle (Urteile)",
    "Oráculo (etiquetas)",
    "预言机（标签）",
  ),
  hook: L(
    "Хук Uniswap v4",
    "Uniswap v4 hook",
    "Uniswap-v4-Hook",
    "Hook de Uniswap v4",
    "Uniswap v4 钩子",
  ),
  publisher: L(
    "Кошелёк, который пишет",
    "Publisher wallet",
    "Publisher-Wallet",
    "Wallet publicadora",
    "发布钱包",
  ),
  logH: L(
    "Последние записи",
    "Latest records",
    "Neueste Einträge",
    "Últimos registros",
    "最新记录",
  ),
  logEmpty: L(
    "Записей пока нет.",
    "No records yet.",
    "Noch keine Einträge.",
    "Aún no hay registros.",
    "暂无记录。",
  ),
  token: L("Токен", "Token", "Token", "Token", "代币"),
  label: L("Оценка", "Label", "Urteil", "Etiqueta", "标签"),
  when: L("Когда", "When", "Wann", "Cuándo", "时间"),
  tx: L("Транзакция", "Transaction", "Transaktion", "Transacción", "交易"),
  hookH: L(
    "Хук для Uniswap v4",
    "Uniswap v4 hook",
    "Uniswap-v4-Hook",
    "Hook de Uniswap v4",
    "Uniswap v4 钩子",
  ),
  hookText: L(
    "Пул Uniswap v4 с этим хуком спрашивает оракул про покупаемый токен. Если у токена свежая оценка «высокий риск», покупка проходит только с подтверждением «я понимаю риск» — кошелёк или сайт показывает предупреждение и передаёт его. Продажа не ограничивается никогда. Нет оценки или она старше 3 дней — пул работает как обычно. У хука нет владельца.",
    "A Uniswap v4 pool with this hook asks the oracle about the token being bought. If the token has a fresh “High risk” label, the buy goes through only with an “I understand the risk” acknowledgement — the wallet or site shows a warning and passes it. Selling is never restricted. No label or older than 3 days — the pool works normally. The hook has no owner.",
    "Ein Uniswap-v4-Pool mit diesem Hook fragt das Oracle nach dem gekauften Token. Hat er ein frisches Urteil „Hohes Risiko“, geht der Kauf nur mit der Bestätigung „Ich verstehe das Risiko“ durch — die Wallet oder Website zeigt eine Warnung und übergibt sie. Verkäufe werden nie eingeschränkt. Kein oder über 3 Tage altes Urteil — der Pool funktioniert normal. Der Hook hat keinen Owner.",
    "Un pool de Uniswap v4 con este hook consulta el oráculo sobre el token que se compra. Si tiene una etiqueta reciente de «riesgo alto», la compra solo pasa con la confirmación «entiendo el riesgo»: la wallet o la web muestra un aviso y la envía. La venta nunca se restringe. Sin etiqueta o con más de 3 días, el pool funciona normalmente. El hook no tiene dueño.",
    "带此钩子的 Uniswap v4 池会向预言机查询所买入的代币。若该代币有最新的“高风险”标签，只有附带“我了解风险”的确认才能买入——钱包或网站显示警告并传递确认。卖出从不受限。无标签或标签超过 3 天——池子正常运作。钩子没有所有者。",
  ),
  devH: L(
    "Для разработчиков",
    "For developers",
    "Für Entwickler",
    "Para desarrolladores",
    "开发者",
  ),
  rules: L(
    "Оценка описывает найденные признаки риска и не означает, что токен «безопасен». Это не инвестиционная рекомендация.",
    "A label describes detected risk signs; it never means a token is “safe”. Not investment advice.",
    "Ein Urteil beschreibt erkannte Risikomerkmale und bedeutet nie, dass ein Token „sicher“ ist. Keine Anlageberatung.",
    "Una etiqueta describe señales de riesgo detectadas; nunca significa que un token sea «seguro». No es asesoramiento de inversión.",
    "标签描述已检测到的风险迹象，绝不意味着代币“安全”。不构成投资建议。",
  ),
};

const LEVEL_KEY = { 1: "low", 2: "elevated", 3: "high", 4: "insufficient" } as const;
const LEVEL_COLOR = {
  1: "var(--color-risk-low)",
  2: "var(--color-risk-elevated)",
  3: "var(--color-risk-high)",
  4: "var(--color-risk-none)",
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return pageMetadata({
    path: "/oracle",
    locale,
    title: pickText(TXT.title, locale),
    description: pickText(TXT.description, locale),
  });
}

const SOLIDITY = `interface IQuvrRiskOracle {
    function isHighRisk(address token, uint256 maxAge)
        external view returns (bool known, bool high);
}

(bool known, bool high) = oracle.isHighRisk(token, 1 days);
if (known && high) {
    // show a warning / require confirmation
}`;

const HOOK_DATA = `// Buying a High-risk token through a pool with QuvrRiskHook:
bytes memory hookData = abi.encode(keccak256("QUVR_RISK_ACKNOWLEDGED"));`;

export default async function OraclePage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const x = (v: LocalizedText) => pickText(v, locale);
  const info = oracleInfo();
  const [stats, log] = await Promise.all([
    oracleStats().catch(() => ({ labels: null, tokens: null })),
    oracleLog().catch(() => []),
  ]);
  const explorer = info.explorerUrl;
  const addrRow = (label: LocalizedText, addr: string | null, verified: boolean) =>
    addr ? (
      <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-rule/60 py-2">
        <span className="w-44 shrink-0 text-muted">{x(label)}</span>
        <a
          href={`${explorer}/address/${addr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-mono text-xs text-signal underline decoration-dotted"
        >
          {addr} ↗
        </a>
        {verified && (
          <a
            href={`https://repo.sourcify.dev/${info.chainId}/${addr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm border border-risk-low/60 px-1.5 text-[0.65rem] text-risk-low"
          >
            ✓ {x(TXT.verified)}
          </a>
        )}
      </li>
    ) : null;

  return (
    <article className="mx-auto max-w-4xl space-y-8" data-testid="oracle-page">
      <header className="rise space-y-3 pt-4">
        <div className="label">{x(TXT.kicker)} · Robinhood Chain</div>
        <h1 className="font-display text-3xl font-bold sm:text-5xl">
          QUVR <span className="text-signal">Risk Oracle</span>
        </h1>
        <p className="max-w-3xl text-muted sm:text-lg">{x(TXT.lead)}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="font-display text-4xl font-bold text-signal" data-testid="oracle-labels">
            {stats.labels ?? "—"}
          </div>
          <div className="label mt-1">{x(TXT.labels)}</div>
        </div>
        <div className="panel p-4">
          <div className="font-display text-4xl font-bold">{stats.tokens ?? "—"}</div>
          <div className="label mt-1">{x(TXT.tokens)}</div>
        </div>
        <div className="panel p-4">
          <div className="font-display text-2xl font-bold">30 min</div>
          <div className="label mt-1">{x(TXT.cadence)}</div>
        </div>
      </section>

      <section className="panel p-4" aria-labelledby="or-addr">
        <h2 id="or-addr" className="mb-2 font-display text-lg font-medium">
          {x(TXT.addrH)}
        </h2>
        <ul className="text-sm">
          {addrRow(TXT.oracle, info.address, true)}
          {addrRow(TXT.hook, info.hook, true)}
          {addrRow(TXT.publisher, info.publisher, false)}
          {addrRow(
            L(
              "Uniswap v4 PoolManager",
              "Uniswap v4 PoolManager",
              "Uniswap v4 PoolManager",
              "Uniswap v4 PoolManager",
              "Uniswap v4 PoolManager",
            ),
            info.poolManager,
            false,
          )}
        </ul>
      </section>

      <section className="panel p-4" aria-labelledby="or-log">
        <h2 id="or-log" className="mb-2 font-display text-lg font-medium">
          {x(TXT.logH)}
        </h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted">{x(TXT.logEmpty)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="label text-left">
                <tr>
                  <th className="py-1 pr-3">{x(TXT.token)}</th>
                  <th className="py-1 pr-3">{x(TXT.label)}</th>
                  <th className="py-1 pr-3">{x(TXT.when)}</th>
                  <th className="py-1">{x(TXT.tx)}</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 20).map((e) => {
                  const lv = e.level as keyof typeof LEVEL_KEY;
                  return (
                    <tr key={`${e.tx}-${e.token}`} className="border-t border-rule/60">
                      <td className="py-1.5 pr-3">
                        <Link href={`/token/${e.token}`} className="font-medium hover:text-signal">
                          {e.symbol ? `$${e.symbol}` : shortAddress(e.token)}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3" style={{ color: LEVEL_COLOR[lv] }}>
                        {t(`lvl_${LEVEL_KEY[lv] ?? "insufficient"}`)}
                      </td>
                      <td className="num py-1.5 pr-3 text-xs text-dim">
                        {formatAge(e.at, locale)}
                      </td>
                      <td className="py-1.5">
                        <a
                          href={`${explorer}/tx/${e.tx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-signal underline decoration-dotted"
                        >
                          {shortAddress(e.tx, 6, 4)} ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel space-y-2 p-4" aria-labelledby="or-hook">
        <h2 id="or-hook" className="font-display text-lg font-medium">
          {x(TXT.hookH)}
        </h2>
        <p className="text-sm text-muted">{x(TXT.hookText)}</p>
      </section>

      <section className="panel space-y-3 p-4" aria-labelledby="or-dev">
        <h2 id="or-dev" className="font-display text-lg font-medium">
          {x(TXT.devH)}
        </h2>
        <pre className="overflow-x-auto rounded-sm border border-rule bg-ink/60 p-3 font-mono text-xs text-paper/90">
          {SOLIDITY}
        </pre>
        <pre className="overflow-x-auto rounded-sm border border-rule bg-ink/60 p-3 font-mono text-xs text-paper/90">
          {HOOK_DATA}
        </pre>
      </section>

      <p className="text-xs text-dim">{x(TXT.rules)}</p>
    </article>
  );
}
