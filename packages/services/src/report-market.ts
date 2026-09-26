import { getProviders } from "@quvr/providers";
import { chainSlug, sourced, type TokenReport } from "@quvr/shared";
import { swr } from "./cache";

/** Price display refresh: never changes risk scores, report age, or stored risk evidence. */
export async function withLiveMarket(report: TokenReport): Promise<TokenReport> {
  try {
    const result = await swr(
      `report-market:${report.chainId}:${report.address}`,
      {
        freshSeconds: 20,
        keepSeconds: 600,
      },
      async () => {
        const { pairs } = await getProviders().market.getTokenPairs(
          chainSlug(report.chainId),
          report.address,
        );
        const main = pairs[0];
        if (!main) throw new Error("market data unavailable");
        return { main, at: new Date().toISOString() };
      },
    );
    const { main, at } = result.value;
    const options = { fetchedAt: at, isStale: result.isStale, confidence: "high" as const };
    const market = { ...report.market };
    for (const key of ["priceUsd", "priceNative", "marketCapUsd", "fdvUsd"] as const) {
      const value = main[key];
      market[key] =
        value === null ? { ...market[key], isStale: true } : sourced(value, "dexscreener", options);
    }
    market.volume = sourced(main.volume, "dexscreener", options);
    market.txns = sourced(main.txns, "dexscreener", options);
    market.priceChange = sourced(main.priceChange, "dexscreener", options);
    return { ...report, market };
  } catch {
    const market = { ...report.market };
    for (const key of [
      "priceUsd",
      "priceNative",
      "marketCapUsd",
      "fdvUsd",
      "volume",
      "txns",
      "priceChange",
    ] as const) {
      Object.assign(market, { [key]: { ...market[key], isStale: true } });
    }
    return { ...report, market };
  }
}
