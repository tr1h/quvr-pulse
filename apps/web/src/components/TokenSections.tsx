import Link from "next/link";
import {
  formatAge,
  formatNumber,
  formatPct,
  formatSmallPrice,
  formatUsd,
  shortAddress,
  displayAddress,
  type Locale,
  type RiskFinding,
  type TokenReport,
  type LocalizedText,
} from "@quvr/shared";
import { LineChart } from "@/components/LineChart";
import { Sourced, Stat } from "@/components/Sourced";
import { termForCode } from "@/lib/glossary";
import { lt, makeT, tx } from "@/lib/i18n";

const SEV: Record<RiskFinding["severity"], { color: string; label: LocalizedText }> = {
  critical: {
    color: "var(--color-risk-critical)",
    label: { ru: "критично", en: "critical", de: "kritisch", es: "crítico", zh: "严重" },
  },
  high: {
    color: "var(--color-risk-high)",
    label: { ru: "высокий", en: "high", de: "hoch", es: "alto", zh: "高" },
  },
  medium: {
    color: "var(--color-risk-elevated)",
    label: { ru: "средний", en: "medium", de: "mittel", es: "medio", zh: "中" },
  },
  low: {
    color: "var(--color-muted)",
    label: { ru: "низкий", en: "low", de: "niedrig", es: "bajo", zh: "低" },
  },
  info: {
    color: "var(--color-dim)",
    label: { ru: "инфо", en: "info", de: "Info", es: "info", zh: "信息" },
  },
};

export function Panel({
  title,
  children,
  id,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className="panel p-4" aria-labelledby={id} data-testid={id}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={id} className="font-display text-base font-medium">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Solscan uses /account/…, Blockscout /address/…. */
function explorerAddress(explorer: string, a: string) {
  return explorer.includes("solscan") ? `${explorer}/account/${a}` : `${explorer}/address/${a}`;
}

function AddrLink({ a, explorer }: { a: string; explorer: string }) {
  return (
    <a
      href={explorerAddress(explorer, a)}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="num hover:text-signal"
      title={displayAddress(a)}
    >
      {shortAddress(displayAddress(a))}
    </a>
  );
}

export function Findings({ r, locale }: { r: TokenReport; locale: Locale }) {
  const t = makeT(locale);
  return (
    <Panel title={`${t("warnings")} (${r.findings.length})`} id="findings">
      {r.findings.length === 0 ? (
        <p className="text-sm text-muted">{t("noFindings")}</p>
      ) : (
        <ul className="space-y-2">
          {r.findings.map((f) => {
            const s = SEV[f.severity];
            return (
              <li
                key={f.code}
                className="rounded border border-rule/70 bg-ink/40 p-3"
                style={{ borderLeft: `3px solid ${s.color}` }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className="font-mono text-[0.65rem] uppercase tracking-wider"
                    style={{ color: s.color }}
                  >
                    {lt(locale, s.label)}
                  </span>
                  <span className="font-medium">{lt(locale, f.title)}</span>
                  <span className="ml-auto font-mono text-[0.62rem] text-dim">
                    {f.source} · {t("confidence")}: {t(`conf_${f.confidence}`)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-paper/80">{lt(locale, f.explanation)}</p>
                {termForCode(f.code) && (
                  <Link
                    href={`/learn/${termForCode(f.code)!.slug}`}
                    className="mt-1 inline-block text-xs text-signal underline decoration-dotted hover:no-underline"
                  >
                    {tx(locale, {
                      ru: "Что это значит?",
                      en: "What does this mean?",
                      de: "Was bedeutet das?",
                      es: "¿Qué significa?",
                      zh: "这是什么意思？",
                    })}{" "}
                    →
                  </Link>
                )}
                {f.evidence.filter(Boolean).length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-mono text-[0.65rem] uppercase tracking-wider text-muted">
                      {t("evidence")}
                    </summary>
                    <ul className="mt-1 space-y-0.5 break-all font-mono text-[0.7rem] text-muted">
                      {f.evidence.filter(Boolean).map((e, i) => (
                        <li key={i}>› {e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function Charts({ r, locale }: { r: TokenReport; locale: Locale }) {
  const t = makeT(locale);
  const quote = r.liquidity.mainPair.value?.quoteToken.symbol ?? "ETH";
  const price = (r.history.price.value ?? []).map((p) => ({ t: p.t, v: p.priceNative }));
  const liq = (r.history.liquidity.value ?? []).map((p) => ({ t: p.t, v: p.liquidityUsd }));
  return (
    <Panel title={t("charts")} id="charts">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="label mb-2">
            {t("priceChart")} · {quote}
          </div>
          {price.length >= 2 ? (
            <LineChart
              points={price}
              label={t("priceChart")}
              format={(v) => `${formatSmallPrice(v, locale, "")} ${quote}`}
            />
          ) : (
            <p className="text-sm text-muted">{r.history.price.error ?? t("notEnoughHistory")}</p>
          )}
          <p className="mt-1 font-mono text-[0.6rem] text-dim">{r.history.price.source}</p>
        </div>
        <div>
          <div className="label mb-2">{t("liqChart")} · USD</div>
          {liq.length >= 2 ? (
            <LineChart
              points={liq}
              color="var(--color-risk-low)"
              label={t("liqChart")}
              format={(v) => formatUsd(v, locale) ?? ""}
            />
          ) : (
            <p className="text-sm text-muted">{t("notEnoughHistory")}</p>
          )}
          <p className="mt-1 font-mono text-[0.6rem] text-dim">{r.history.liquidity.source}</p>
        </div>
      </div>
    </Panel>
  );
}

export function LiquidityPanel({ r, locale }: { r: TokenReport; locale: Locale }) {
  const t = makeT(locale);
  const L = r.liquidity;
  const quote = L.mainPair.value?.quoteToken.symbol ?? "ETH";
  return (
    <Panel title={t("liquidityDetails")} id="liquidity">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label={t("mainPool")}>
          <Sourced
            v={L.mainPair}
            locale={locale}
            format={(p) => (
              <a
                href={p.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:text-signal"
              >
                {p.dexId} {p.kind} · {p.baseToken.symbol}/{p.quoteToken.symbol}
              </a>
            )}
          />
        </Stat>
        <Stat label={t("mainPoolShare")}>
          <Sourced v={L.mainPoolShare} locale={locale} format={(v) => formatPct(v, locale)} />
        </Stat>
        <Stat label={t("liqMcap")}>
          <Sourced v={L.liquidityToMcap} locale={locale} format={(v) => formatPct(v, locale)} />
        </Stat>
        <Stat label={t("poolAge")}>
          <Sourced
            v={L.poolAgeHours}
            locale={locale}
            format={(v) =>
              v < 48
                ? `${v.toFixed(1)} ${tx(locale, { ru: "ч", en: "h", de: "h", es: "h", zh: "小时" })}`
                : `${(v / 24).toFixed(1)} ${tx(locale, { ru: "д", en: "d", de: "T", es: "d", zh: "天" })}`
            }
          />
        </Stat>
        <Stat label={t("buysSells")}>
          <Sourced
            v={r.market.txns}
            locale={locale}
            format={(v) => (v.h24 ? `${v.h24.buys} / ${v.h24.sells}` : t("noData"))}
          />
        </Stat>
        <Stat label={t("netFlow")}>
          <Sourced
            v={L.netFlowNative}
            locale={locale}
            format={(v) => (
              <span className={v.h24 >= 0 ? "text-risk-low" : "text-risk-high"}>
                {v.h24 >= 0 ? "+" : ""}
                {formatNumber(v.h24, locale, 3)} {quote}
              </span>
            )}
          />
        </Stat>
      </div>
      <div className="mt-5">
        <div className="label mb-2">{t("impact")}</div>
        <Sourced
          v={L.priceImpact}
          locale={locale}
          format={(rows) => (
            <table className="w-full max-w-md text-sm" data-testid="impact-table">
              <tbody>
                {rows.map((x) => (
                  <tr key={x.usd} className="border-t border-rule/60">
                    <td className="py-1">${x.usd.toLocaleString("en-US")}</td>
                    <td
                      className="py-1 text-right"
                      style={{
                        color:
                          x.impactPct > 0.1
                            ? "var(--color-risk-high)"
                            : x.impactPct > 0.03
                              ? "var(--color-risk-elevated)"
                              : "var(--color-paper)",
                      }}
                    >
                      ≈ −{formatPct(x.impactPct, locale, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />
        <p className="mt-1 text-xs text-dim">{t("impactNote")}</p>
      </div>
    </Panel>
  );
}

export function ContractPanel({
  r,
  locale,
  explorer,
}: {
  r: TokenReport;
  locale: Locale;
  explorer: string;
}) {
  const t = makeT(locale);
  const c = r.contract.value;
  const sol = r.chainFamily === "solana";
  const sim = r.simulation.value;
  const cr = r.creation.value;
  const yes = tx(locale, { ru: "да", en: "yes", de: "ja", es: "sí", zh: "是" });
  const no = tx(locale, { ru: "нет", en: "no", de: "nein", es: "no", zh: "否" });
  return (
    <Panel title={t("contract")} id="contract">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row
          k={tx(locale, {
            ru: "Контракт",
            en: "Is contract",
            de: "Ist Contract",
            es: "Es contrato",
            zh: "是否为合约",
          })}
          v={c ? (c.isContract ? yes : no) : t("noData")}
        />
        <Row
          k={tx(locale, {
            ru: "Код верифицирован",
            en: "Verified source",
            de: "Verifizierter Code",
            es: "Código verificado",
            zh: "源码已验证",
          })}
          v={
            c?.verified === null || !c ? (
              <span className="text-dim">{t("noData")} (Blockscout)</span>
            ) : c.verified ? (
              yes
            ) : (
              no
            )
          }
        />
        <Row
          k="Proxy"
          v={
            c
              ? c.proxy.isProxy
                ? `${c.proxy.kind} → ${c.proxy.implementation ? shortAddress(c.proxy.implementation) : "?"}`
                : no
              : t("noData")
          }
        />
        <Row
          k={tx(locale, {
            ru: "Владелец",
            en: "Owner",
            de: "Owner",
            es: "Propietario",
            zh: "所有者",
          })}
          v={
            c ? (
              c.owner.address ? (
                <AddrLink a={c.owner.address} explorer={explorer} />
              ) : c.owner.kind === "none" ? (
                tx(locale, {
                  ru: "функций владельца нет",
                  en: "no owner functions",
                  de: "keine Owner-Funktionen",
                  es: "sin funciones de propietario",
                  zh: "无所有者函数",
                })
              ) : (
                c.owner.kind
              )
            ) : (
              t("noData")
            )
          }
        />
        <Row
          k="Deployer"
          v={cr?.deployer ? <AddrLink a={cr.deployer} explorer={explorer} /> : t("noData")}
        />
        {sol ? (
          <>
            <Row
              k={tx(locale, {
                ru: "Программа токена",
                en: "Token program",
                de: "Token-Programm",
                es: "Programa del token",
                zh: "代币程序",
              })}
              v={c?.contractName ?? t("noData")}
            />
            <Row
              k={tx(locale, {
                ru: "Расширения Token-2022",
                en: "Token-2022 extensions",
                de: "Token-2022-Erweiterungen",
                es: "Extensiones Token-2022",
                zh: "Token-2022 扩展",
              })}
              v={c ? String(c.selectorsFound) : t("noData")}
            />
          </>
        ) : (
          <>
            <Row
              k={tx(locale, {
                ru: "Фабрика",
                en: "Factory",
                de: "Factory",
                es: "Factory",
                zh: "工厂合约",
              })}
              v={cr?.factory ? <AddrLink a={cr.factory} explorer={explorer} /> : "—"}
            />
            <Row
              k={tx(locale, {
                ru: "Размер байткода",
                en: "Bytecode size",
                de: "Bytecode-Größe",
                es: "Tamaño del bytecode",
                zh: "字节码大小",
              })}
              v={
                c?.bytecodeSize
                  ? `${c.bytecodeSize} B · ${c.selectorsFound} selectors`
                  : t("noData")
              }
            />
            <Row
              k="Code hash"
              v={
                c?.codeHash ? (
                  <span className="num">{shortAddress(c.codeHash, 10, 6)}</span>
                ) : (
                  t("noData")
                )
              }
            />
          </>
        )}
      </dl>
      {c && (
        <div className="mt-4">
          <div className="label mb-2">
            {sol
              ? tx(locale, {
                  ru: "Полномочия и расширения mint",
                  en: "Mint authorities & extensions",
                  de: "Mint-Berechtigungen & Erweiterungen",
                  es: "Autoridades del mint y extensiones",
                  zh: "Mint 权限与扩展",
                })
              : tx(locale, {
                  ru: "Привилегии (байткод + read-only пробы)",
                  en: "Privileges (bytecode + read-only probes)",
                  de: "Berechtigungen (Bytecode + Read-only-Tests)",
                  es: "Privilegios (bytecode + pruebas de solo lectura)",
                  zh: "特权（字节码 + 只读探测）",
                })}
          </div>
          {c.capabilities.filter((x) => x.present && x.id !== "ownership").length === 0 ? (
            <p className="text-sm text-muted">
              {sol
                ? tx(locale, {
                    ru: "Mint и freeze authority отозваны, опасных расширений нет.",
                    en: "Mint and freeze authorities revoked, no risky extensions.",
                    de: "Mint- und Freeze-Berechtigung entzogen, keine riskanten Erweiterungen.",
                    es: "Autoridades de mint y freeze revocadas, sin extensiones de riesgo.",
                    zh: "Mint 和 freeze 权限均已撤销，无风险扩展。",
                  })
                : tx(locale, {
                    ru: "Не обнаружены в диспетчере функций.",
                    en: "None found in the function dispatcher.",
                    de: "Im Funktions-Dispatcher nicht gefunden.",
                    es: "No se encontraron en el despachador de funciones.",
                    zh: "函数分发器中未发现。",
                  })}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {c.capabilities
                .filter((x) => x.present && x.id !== "ownership")
                .map((x) => (
                  <li
                    key={x.id}
                    className="rounded border border-risk-elevated/60 px-2 py-0.5 font-mono text-xs text-risk-elevated"
                    title={x.evidence.join("\n")}
                  >
                    {x.id} · {x.gated}
                  </li>
                ))}
            </ul>
          )}
          {c.feeReadings.length > 0 && (
            <p className="mt-2 font-mono text-xs text-muted">
              {c.feeReadings.map((f) => `${f.fn} = ${f.value}`).join(" · ")}
            </p>
          )}
        </div>
      )}
      <div className="mt-4 rounded border border-rule/70 bg-ink/40 p-3" data-testid="simulation">
        <div className="label mb-1">{t("simulation")}</div>
        {sim ? (
          <>
            <p
              className="font-medium"
              style={{
                color:
                  sim.status === "passed"
                    ? "var(--color-risk-low)"
                    : sim.status === "failed"
                      ? "var(--color-risk-critical)"
                      : "var(--color-muted)",
              }}
            >
              {sim.status === "passed"
                ? tx(locale, {
                    ru: "Переводы по пути покупки и продажи не блокируются",
                    en: "Transfers along the buy and sell path are not blocked",
                    de: "Transfers auf dem Kauf- und Verkaufsweg werden nicht blockiert",
                    es: "Las transferencias en la ruta de compra y venta no están bloqueadas",
                    zh: "买入和卖出路径上的转账未被阻止",
                  })
                : sim.status === "failed"
                  ? tx(locale, {
                      ru: "Продажа может быть заблокирована",
                      en: "Selling may be blocked",
                      de: "Verkauf könnte blockiert sein",
                      es: "La venta podría estar bloqueada",
                      zh: "卖出可能被阻止",
                    })
                  : "Sell simulation unavailable"}
            </p>
            <p className="mt-1 break-all font-mono text-[0.7rem] text-muted">
              {sim.method}
              {sim.sell ? ` · sell: ${sim.sell.detail}` : ""}
              {sim.buy ? ` · buy: ${sim.buy.detail}` : ""}
            </p>
            <p className="mt-1 text-xs text-dim">{lt(locale, sim.notes)}</p>
          </>
        ) : (
          <p className="text-muted">
            Sell simulation unavailable{r.simulation.error ? ` — ${r.simulation.error}` : ""}
          </p>
        )}
      </div>
    </Panel>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-rule/50 py-1">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

export function DistributionPanel({
  r,
  locale,
  explorer,
}: {
  r: TokenReport;
  locale: Locale;
  explorer: string;
}) {
  const t = makeT(locale);
  const D = r.distribution;
  const TAG: Record<string, LocalizedText> = {
    deployer: { ru: "deployer", en: "deployer", de: "Deployer", es: "deployer", zh: "部署者" },
    "possibly-related": {
      ru: "связан?",
      en: "related?",
      de: "verbunden?",
      es: "¿vinculada?",
      zh: "关联？",
    },
    fresh: { ru: "свежий", en: "fresh", de: "neu", es: "nueva", zh: "新钱包" },
    contract: { ru: "контракт", en: "contract", de: "Contract", es: "contrato", zh: "合约" },
    eip7702: {
      ru: "7702-кошелёк",
      en: "7702 wallet",
      de: "7702-Wallet",
      es: "wallet 7702",
      zh: "7702 钱包",
    },
  };
  return (
    <Panel title={t("holders")} id="holders">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("holdersCount")}>
          <Sourced
            v={D.holdersCount}
            locale={locale}
            format={(v) => formatNumber(v, locale, 0)}
            testId="holders-count"
          />
        </Stat>
        <Stat label={t("topShare")}>
          <Sourced
            v={D.concentration}
            locale={locale}
            format={(c) =>
              `${formatPct(c.top1, locale, 0)} / ${formatPct(c.top5, locale, 0)} / ${formatPct(c.top10, locale, 0)} / ${formatPct(c.top20, locale, 0)}`
            }
          />
        </Stat>
        <Stat label={t("deployerShare")}>
          <Sourced v={D.deployerShare} locale={locale} format={(v) => formatPct(v, locale, 2)} />
        </Stat>
        <Stat label={t("relatedShare")}>
          <Sourced v={D.relatedShare} locale={locale} format={(v) => formatPct(v, locale, 2)} />
        </Stat>
        <Stat label={t("growth24")}>
          <Sourced
            v={D.holderGrowth}
            locale={locale}
            format={(v) => `${v.h24 >= 0 ? "+" : ""}${formatPct(v.h24, locale, 1)}`}
          />
        </Stat>
        <Stat label={t("newWallets")}>
          <Sourced v={D.newWallets24h} locale={locale} format={(v) => formatNumber(v, locale, 0)} />
        </Stat>
        <Stat label={t("freshShare")}>
          <Sourced v={D.freshWalletShare} locale={locale} format={(v) => formatPct(v, locale, 0)} />
        </Stat>
        <Stat
          label={tx(locale, {
            ru: "Массовые рассылки",
            en: "Mass distributions",
            de: "Massenverteilungen",
            es: "Distribuciones masivas",
            zh: "批量分发",
          })}
        >
          <Sourced
            v={D.massTransfers}
            locale={locale}
            format={(v) => `${v.count} (max ${v.largestFanOut})`}
          />
        </Stat>
      </div>

      {D.top.value && D.top.value.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm" data-testid="holders-table">
            <thead>
              <tr className="label text-left">
                <th className="py-1 pr-2 font-normal">#</th>
                <th className="py-1 pr-2 font-normal">{t("address")}</th>
                <th className="py-1 pr-2 text-right font-normal">{t("share")}</th>
                <th className="py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {D.top.value.map((h, i) => (
                <tr key={h.address} className="border-t border-rule/60">
                  <td className="num py-1 pr-2 text-dim">{i + 1}</td>
                  <td className="py-1 pr-2">
                    <AddrLink a={h.address} explorer={explorer} />
                  </td>
                  <td className="num py-1 pr-2 text-right">
                    <span
                      className="inline-block h-1.5 align-middle"
                      style={{
                        width: `${Math.min(60, h.share * 300)}px`,
                        background: "var(--color-signal-dim)",
                      }}
                    />{" "}
                    {formatPct(h.share, locale, 2)}
                  </td>
                  <td className="py-1">
                    {h.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`mr-1 rounded-sm px-1 font-mono text-[0.62rem] ${tag === "deployer" || tag === "possibly-related" ? "bg-risk-elevated/15 text-risk-elevated" : "bg-panel-2 text-muted"}`}
                      >
                        {TAG[tag] ? lt(locale, TAG[tag]) : tag}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 font-mono text-[0.6rem] text-dim">
            {tx(locale, {
              ru: "Доля от обращения без исключённых адресов",
              en: "Share of circulating supply excluding the addresses below",
              de: "Anteil am Umlauf ohne die unten ausgenommenen Adressen",
              es: "Cuota del suministro circulante sin las direcciones excluidas abajo",
              zh: "占流通量比例（不含下方排除的地址）",
            })}
          </p>
        </div>
      )}

      {D.excluded.value && D.excluded.value.length > 0 && (
        <div className="mt-5">
          <div className="label mb-2">{t("excluded")}</div>
          <ul className="space-y-1 text-sm">
            {D.excluded.value.map((e) => (
              <li
                key={e.address}
                className="flex flex-wrap justify-between gap-2 border-t border-rule/60 py-1"
              >
                <span>
                  <AddrLink a={e.address} explorer={explorer} />{" "}
                  <span className="text-muted">— {lt(locale, e.label)}</span>
                </span>
                <span className="num">{formatPct(e.shareOfTotal, locale, 2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <div className="label mb-1">{t("clusters")}</div>
        <p className="mb-2 text-xs text-dim">{t("clustersNote")}</p>
        {D.clusters.value === null ? (
          <p className="text-sm text-dim">{t("noData")}</p>
        ) : D.clusters.value.length === 0 ? (
          <p className="text-sm text-muted">{t("noClusters")}</p>
        ) : (
          <ul className="space-y-2">
            {D.clusters.value.slice(0, 6).map((c) => (
              <li key={c.id} className="rounded border border-rule/70 p-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {c.wallets.length}{" "}
                    {tx(locale, {
                      ru: "кошельков",
                      en: "wallets",
                      de: "Wallets",
                      es: "wallets",
                      zh: "个钱包",
                    })}{" "}
                    · {formatPct(c.combinedShareOfTotal, locale, 2)}
                    {c.linkedToDeployer && (
                      <span className="ml-2 text-risk-elevated">deployer</span>
                    )}
                  </span>
                  <span className="font-mono text-[0.65rem] text-dim">
                    {t("confidence")}: {t(`conf_${c.confidence}`)}
                  </span>
                </div>
                <div className="mt-1 break-all font-mono text-[0.68rem] text-muted">
                  {c.signals
                    .slice(0, 3)
                    .map((s) => `${s.signal}: ${s.evidence}`)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export function DeployerPanel({
  r,
  locale,
  explorer,
}: {
  r: TokenReport;
  locale: Locale;
  explorer: string;
}) {
  const t = makeT(locale);
  const acts = r.deployerActions.value;
  const KIND: Record<string, LocalizedText> = {
    sell: { ru: "продажа", en: "sell", de: "Verkauf", es: "venta", zh: "卖出" },
    buy: { ru: "покупка", en: "buy", de: "Kauf", es: "compra", zh: "买入" },
    "transfer-out": {
      ru: "перевод →",
      en: "transfer out",
      de: "Transfer →",
      es: "envío →",
      zh: "转出",
    },
    "transfer-in": {
      ru: "перевод ←",
      en: "transfer in",
      de: "Transfer ←",
      es: "recepción ←",
      zh: "转入",
    },
    create: { ru: "выпуск", en: "mint", de: "Mint", es: "emisión", zh: "铸造" },
  };
  return (
    <Panel title={t("deployer")} id="deployer">
      {acts === null ? (
        <p className="text-sm text-dim">{t("noData")}</p>
      ) : acts.length === 0 ? (
        <p className="text-sm text-muted">{t("noDeployerActions")}</p>
      ) : (
        <ul className="divide-y divide-rule/60 text-sm">
          {acts.slice(0, 12).map((a) => (
            <li
              key={`${a.txHash}-${a.kind}`}
              className="flex flex-wrap items-center gap-x-3 py-1.5"
            >
              <span
                className={`w-24 font-mono text-xs ${a.kind === "sell" ? "text-risk-high" : "text-muted"}`}
              >
                {KIND[a.kind] ? lt(locale, KIND[a.kind]) : a.kind}
              </span>
              <span className="num">
                {a.amount !== null ? formatNumber(a.amount, locale, 2) : "?"}
              </span>
              <a
                href={`${explorer}/tx/${a.txHash}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="num ml-auto text-xs text-muted hover:text-signal"
              >
                {shortAddress(a.txHash, 8, 6)}
              </a>
              <span className="num w-14 text-right text-xs text-dim">
                {formatAge(a.timestamp, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 font-mono text-[0.6rem] text-dim">{r.deployerActions.source}</p>
    </Panel>
  );
}

export function SocialPanel({ r, locale }: { r: TokenReport; locale: Locale }) {
  const t = makeT(locale);
  // No Fomo data for this chain/token: the Social score card already says so — no empty panel.
  if (!r.social.available) return null;
  const theses = [...(r.social.theses.value ?? [])].sort(
    (x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt),
  );
  if (theses.length === 0) return null;
  const authors = [...(r.social.authors.value ?? [])].sort(
    (x, y) => (y.qualityScore ?? -1) - (x.qualityScore ?? -1),
  );
  const tier = new Map(authors.map((a) => [a.handle.toLowerCase(), a.qualityTier]));
  const strong = theses.filter((th) => tier.get(th.authorHandle.toLowerCase()) === "high").length;
  const h1 = theses
    .map((th) => th.outcomes["1h"])
    .filter((v): v is number => typeof v === "number")
    .sort((x, y) => x - y);
  const medianH1 = h1.length ? h1[Math.floor(h1.length / 2)]! : null;
  const L = (ru: string, en: string, de: string, es: string, zh: string) =>
    tx(locale, { ru, en, de, es, zh });

  const Chip = ({ label, v }: { label: string; v: number | null | "pending" }) => {
    const n = typeof v === "number" ? v : null;
    return (
      <span
        className="rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem]"
        style={{
          borderColor:
            n === null
              ? "var(--color-rule)"
              : n >= 0
                ? "var(--color-risk-low)"
                : "var(--color-risk-high)",
          color:
            n === null
              ? "var(--color-dim)"
              : n >= 0
                ? "var(--color-risk-low)"
                : "var(--color-risk-high)",
        }}
      >
        {label}{" "}
        {v === "pending"
          ? t("pending")
          : n === null
            ? "—"
            : `${n >= 0 ? "+" : ""}${formatPct(n, locale, 1)}`}
      </span>
    );
  };

  const Item = ({ th }: { th: (typeof theses)[number] }) => {
    const q = tier.get(th.authorHandle.toLowerCase());
    return (
      <li className="rounded-sm border border-rule/60 bg-ink/30 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule font-mono text-[0.65rem] text-muted"
            aria-hidden="true"
          >
            {th.authorHandle.slice(0, 1).toUpperCase()}
          </span>
          <Link
            href={`/trader/${encodeURIComponent(th.authorHandle)}`}
            className="font-medium hover:text-signal"
          >
            @{th.authorHandle}
          </Link>
          {q === "high" && (
            <span className="rounded-sm border border-signal/60 px-1 text-[0.6rem] text-signal">
              {L("сильный автор", "strong author", "starker Autor", "autor fuerte", "优质作者")}
            </span>
          )}
          {th.isDev && (
            <span className="rounded-sm border border-risk-high/60 px-1 text-[0.6rem] text-risk-high">
              dev
            </span>
          )}
          <span className="num ml-auto text-xs text-dim">{formatAge(th.createdAt, locale)}</span>
        </div>
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-paper/85">{th.text}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["15m", "1h", "6h", "24h"] as const).map((k) => (
            <Chip key={k} label={k} v={th.outcomes[k]} />
          ))}
        </div>
      </li>
    );
  };

  return (
    <section className="panel p-4" aria-labelledby="social" data-testid="social">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="social" className="font-display text-base font-medium">
          {t("theses")}
        </h2>
        <p className="font-mono text-xs text-muted">
          {theses.length} {L("тезисов", "theses", "Thesen", "tesis", "条观点")}
          {strong > 0 && (
            <>
              {" · "}
              <span className="text-signal">{strong}</span>{" "}
              {L(
                "от сильных авторов",
                "from strong authors",
                "von starken Autoren",
                "de autores fuertes",
                "来自优质作者",
              )}
            </>
          )}
          {medianH1 !== null && (
            <>
              {" · "}
              {L(
                "медиана через 1ч",
                "median after 1h",
                "Median nach 1 Std.",
                "mediana a 1 h",
                "1 小时中位数",
              )}{" "}
              <span className={medianH1 >= 0 ? "text-risk-low" : "text-risk-high"}>
                {`${medianH1 >= 0 ? "+" : ""}${formatPct(medianH1, locale, 1)}`}
              </span>
            </>
          )}
        </p>
      </div>
      <p className="mt-1 text-xs text-dim">
        {L(
          "Что пишут трейдеры Fomo и что стало с ценой после их поста. Мнения — не оценка риска.",
          "What Fomo traders post and what the price did after their post. Opinions, not a risk rating.",
          "Was Fomo-Trader posten und wie sich der Preis danach entwickelte. Meinungen, keine Risikobewertung.",
          "Lo que publican los traders de Fomo y qué hizo el precio después. Opiniones, no una calificación de riesgo.",
          "Fomo 交易者的观点及发帖后的价格表现。仅为观点，并非风险评级。",
        )}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ul className="space-y-2">
            {theses.slice(0, 5).map((th) => (
              <Item key={th.id} th={th} />
            ))}
          </ul>
          {theses.length > 5 && (
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-sm text-signal hover:underline">
                <span className="group-open:hidden">
                  {L("Показать все", "Show all", "Alle anzeigen", "Mostrar todo", "显示全部")} (
                  {theses.length}) ▾
                </span>
                <span className="hidden group-open:inline">
                  {L("Свернуть", "Collapse", "Einklappen", "Contraer", "收起")} ▴
                </span>
              </summary>
              <ul className="mt-2 space-y-2">
                {theses.slice(5, 15).map((th) => (
                  <Item key={th.id} th={th} />
                ))}
              </ul>
            </details>
          )}
        </div>
        <aside aria-labelledby="authors">
          <h3 id="authors" className="label mb-2">
            {t("authors")}
          </h3>
          <ul className="divide-y divide-rule/60 text-sm" data-testid="authors">
            {authors.slice(0, 6).map((a) => (
              <li key={a.handle} className="flex items-center gap-2 py-1.5">
                <Link
                  href={`/trader/${encodeURIComponent(a.handle)}`}
                  className="min-w-0 truncate font-medium hover:text-signal"
                >
                  @{a.handle}
                </Link>
                <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                  WR≥{formatPct(a.winRateWilsonLower, locale, 0) ?? "—"} · n={a.closedTrades}
                </span>
                <span
                  className={`w-8 shrink-0 text-right font-mono text-xs ${a.qualityTier === "high" ? "text-signal" : "text-dim"}`}
                >
                  {a.qualityScore ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}

export function TimelinePanel({
  r,
  locale,
  explorer,
}: {
  r: TokenReport;
  locale: Locale;
  explorer: string;
}) {
  const t = makeT(locale);
  return (
    <Panel title={t("timeline")} id="timeline">
      {r.timeline.length === 0 ? (
        <p className="text-sm text-dim">{t("noData")}</p>
      ) : (
        <ol className="relative ml-2 border-l border-rule">
          {r.timeline.map((e, i) => (
            <li key={i} className="relative pb-3 pl-5">
              <span
                className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-ink"
                style={{
                  background:
                    e.kind === "deployer-sell" ||
                    e.kind === "large-sell" ||
                    e.kind === "author-exit"
                      ? "var(--color-risk-high)"
                      : e.kind === "thesis"
                        ? "var(--color-signal)"
                        : "var(--color-risk-low)",
                }}
              />
              <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-medium">{lt(locale, e.title)}</span>
                {e.txHash && (
                  <a
                    href={`${explorer}/tx/${e.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="num text-xs text-muted hover:text-signal"
                  >
                    {shortAddress(e.txHash, 8, 4)}
                  </a>
                )}
              </div>
              <div className="font-mono text-[0.65rem] text-dim">
                {e.at ? `${e.at.replace("T", " ").slice(0, 16)} UTC` : "—"} · {e.source}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
