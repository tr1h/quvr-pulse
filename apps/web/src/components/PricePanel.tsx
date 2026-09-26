import { getPriceCandles, peekPriceCandles } from "@quvr/services";
import { chainSlug, formatSmallPrice, type Locale, type TokenReport } from "@quvr/shared";
import type { CandleFrame } from "@quvr/providers";
import { CandleChart } from "@/components/CandleChart";
import { ProChart } from "@/components/ProChart";
import { makeT, tx } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

export const FRAMES = ["1d", "7d", "30d"] as const satisfies readonly CandleFrame[];
export type SimpleFrame = (typeof FRAMES)[number];
export type ChartMode = "pro" | "simple";

export async function PricePanel({
  r,
  locale,
  frame,
  mode,
  path,
}: {
  r: TokenReport;
  locale: Locale;
  frame: SimpleFrame;
  mode: ChartMode;
  path: string;
}) {
  const t = makeT(locale);
  const pair = r.liquidity.mainPair.value;
  const effective: ChartMode = pair ? mode : "simple";
  const L = (ru: string, en: string, de: string, es: string, zh: string) =>
    tx(locale, { ru, en, de, es, zh });
  const href = (q: string) => `${localizedPath(`${path}?${q}`, locale)}#price`;

  const data =
    effective === "simple" && pair
      ? await getPriceCandles(chainSlug(r.chainId), r.address, pair, frame)
      : null;
  const candles = data?.candles ?? [];
  // Pro chart: ship cached 15m candles with the page (cache only, never waits on the source).
  const initial =
    effective === "pro" && pair
      ? await peekPriceCandles(chainSlug(r.chainId), r.address, pair, "15m").catch(() => null)
      : null;

  const tab = (active: boolean) =>
    `rounded-sm border px-2 py-0.5 ${
      active
        ? "border-signal bg-signal text-ink"
        : "border-rule text-muted hover:border-signal hover:text-signal"
    }`;

  return (
    <section className="panel p-4" aria-labelledby="price" data-testid="price-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="price" className="font-display text-base font-medium">
          {t("priceUsd")}
        </h2>
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          {pair && (
            <nav className="flex gap-1" aria-label="chart">
              <a
                href={href("chart=pro")}
                className={tab(effective === "pro")}
                data-testid="chart-pro"
              >
                Pro
              </a>
              <a
                href={href(`chart=simple&tf=${frame}`)}
                className={tab(effective === "simple")}
                data-testid="chart-simple"
              >
                Lite
              </a>
            </nav>
          )}
          {effective === "simple" && (
            <nav className="flex gap-1" aria-label={t("timeframe")}>
              {FRAMES.map((f) => (
                <a
                  key={f}
                  href={href(`chart=simple&tf=${f}`)}
                  aria-current={f === frame ? "page" : undefined}
                  className={tab(f === frame)}
                >
                  {t(`tf_${f}`)}
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>

      {effective === "pro" ? (
        <ProChart
          address={r.address}
          dexUrl={r.links.dexscreener}
          initial={initial}
          labels={{
            loading: L(
              "Загружаем свечи…",
              "Loading candles…",
              "Kerzen werden geladen…",
              "Cargando velas…",
              "正在加载K线…",
            ),
            noData: t("noData"),
            error: L(
              "Источник цены не ответил",
              "Price source did not answer",
              "Preisquelle antwortet nicht",
              "La fuente de precios no respondió",
              "价格数据源未响应",
            ),
            ma: "MA 20",
            ema: "EMA 50",
            volume: L("Объём", "Volume", "Volumen", "Volumen", "成交量"),
            log: L("Лог", "Log", "Log", "Log", "对数"),
            undo: L("Отменить", "Undo", "Rückgängig", "Deshacer", "撤销"),
            magnet: L("Магнит", "Magnet", "Magnet", "Imán", "磁吸"),
            magnetHint: L(
              "Точки прилипают к открытию, максимуму, минимуму и закрытию свечи",
              "Points snap to the candle open, high, low and close",
              "Punkte rasten an Eröffnung, Hoch, Tief und Schluss der Kerze ein",
              "Los puntos se ajustan a apertura, máximo, mínimo y cierre de la vela",
              "点位吸附到K线的开盘、最高、最低和收盘价",
            ),
            esc: L(
              "Esc — отмена",
              "Esc to cancel",
              "Esc zum Abbrechen",
              "Esc para cancelar",
              "按 Esc 取消",
            ),
            tools: {
              hline: L("Уровень", "Level", "Linie", "Nivel", "水平线"),
              trend: L("Тренд", "Trend", "Trend", "Tendencia", "趋势线"),
              fib: L("Фибоначчи", "Fib", "Fibonacci", "Fibonacci", "斐波那契"),
              rr: L("Риск/прибыль", "Risk/reward", "Risiko/Ertrag", "Riesgo/beneficio", "风险收益"),
              ruler: L("Линейка", "Measure", "Messen", "Medir", "测量"),
            },
            steps: {
              hline: [
                L(
                  "Кликните по графику, чтобы поставить горизонтальный уровень",
                  "Click the chart to place a horizontal level",
                  "Klicke in den Chart, um eine horizontale Linie zu setzen",
                  "Haz clic en el gráfico para colocar un nivel horizontal",
                  "点击图表放置水平线",
                ),
              ],
              trend: [
                L(
                  "Кликните начало линии",
                  "Click the start of the line",
                  "Klicke auf den Startpunkt",
                  "Haz clic en el inicio de la línea",
                  "点击线的起点",
                ),
                L(
                  "Кликните конец линии",
                  "Click the end of the line",
                  "Klicke auf den Endpunkt",
                  "Haz clic en el final de la línea",
                  "点击线的终点",
                ),
              ],
              fib: [
                L(
                  "Кликните начало движения (например, минимум)",
                  "Click the start of the move (e.g. the low)",
                  "Klicke auf den Beginn der Bewegung (z. B. das Tief)",
                  "Haz clic en el inicio del movimiento (p. ej., el mínimo)",
                  "点击行情起点（例如低点）",
                ),
                L(
                  "Кликните конец движения (например, максимум)",
                  "Click the end of the move (e.g. the high)",
                  "Klicke auf das Ende der Bewegung (z. B. das Hoch)",
                  "Haz clic en el final del movimiento (p. ej., el máximo)",
                  "点击行情终点（例如高点）",
                ),
              ],
              rr: [
                L(
                  "Кликните цену входа",
                  "Click the entry price",
                  "Klicke auf den Einstiegspreis",
                  "Haz clic en el precio de entrada",
                  "点击入场价",
                ),
                L(
                  "Кликните стоп-лосс",
                  "Click the stop-loss",
                  "Klicke auf den Stop-Loss",
                  "Haz clic en el stop-loss",
                  "点击止损价",
                ),
                L(
                  "Кликните цель (тейк-профит)",
                  "Click the target (take-profit)",
                  "Klicke auf das Kursziel (Take-Profit)",
                  "Haz clic en el objetivo (take-profit)",
                  "点击目标价（止盈）",
                ),
              ],
              ruler: [
                L(
                  "Кликните первую точку",
                  "Click the first point",
                  "Klicke auf den ersten Punkt",
                  "Haz clic en el primer punto",
                  "点击第一个点",
                ),
                L(
                  "Кликните вторую точку",
                  "Click the second point",
                  "Klicke auf den zweiten Punkt",
                  "Haz clic en el segundo punto",
                  "点击第二个点",
                ),
              ],
            },
            drawing: {
              long: L("Лонг", "Long", "Long", "Largo", "做多"),
              short: L("Шорт", "Short", "Short", "Corto", "做空"),
              target: L("Цель", "Target", "Ziel", "Objetivo", "目标"),
              stop: L("Стоп", "Stop", "Stop", "Stop", "止损"),
              wrongStop: L(
                "Стоп с той же стороны, что и цель",
                "Stop is on the same side as the target",
                "Stop liegt auf derselben Seite wie das Ziel",
                "El stop está del mismo lado que el objetivo",
                "止损与目标在同一侧",
              ),
              bars: L("св.", "bars", "Kerzen", "velas", "根K线"),
            },
            clear: L("Очистить", "Clear", "Löschen", "Borrar", "清除"),
            fit: L("Весь график", "Fit", "Alles", "Ajustar", "全部"),
            fullscreen: L("Полный экран", "Fullscreen", "Vollbild", "Pantalla completa", "全屏"),
            openDex: L(
              "Все инструменты на Dexscreener",
              "Full toolset on Dexscreener",
              "Alle Werkzeuge auf Dexscreener",
              "Todas las herramientas en Dexscreener",
              "在 Dexscreener 使用全部工具",
            ),
          }}
        />
      ) : (
        <>
          {candles.length >= 3 ? (
            <CandleChart
              candles={candles}
              label={`${t("priceUsd")} · ${t(`tf_${frame}`)}`}
              format={(v) => formatSmallPrice(v, locale)}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted" data-testid="price-nodata">
              {pair ? t("noData") : t("noPool")}
            </p>
          )}
          <p className="mt-1 font-mono text-[0.6rem] text-dim">
            {data
              ? `geckoterminal · ${pair?.dexId ?? ""}${data.isStale ? " · stale" : ""}`
              : "geckoterminal"}
          </p>
        </>
      )}
    </section>
  );
}
