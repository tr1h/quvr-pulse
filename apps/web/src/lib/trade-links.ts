import { chainSlug, type TokenReport } from "@quvr/shared";

const WSOL = "So11111111111111111111111111111111111111112";

/**
 * Swap pages on third-party DEX interfaces with the token prefilled. QUVR never connects
 * wallets, signs transactions or takes a fee: the viewer trades on the external site.
 */
export function tradeLinks(r: TokenReport): Array<{ label: string; url: string }> {
  const slug = chainSlug(r.chainId);
  if (slug === "solana") {
    const out = [
      {
        label: "Jupiter",
        url: `https://jup.ag/swap?sell=${WSOL}&buy=${encodeURIComponent(r.address)}`,
      },
    ];
    const dex = r.liquidity.mainPair.value?.dexId ?? "";
    if (dex.startsWith("pump") || r.address.endsWith("pump"))
      out.push({
        label: "pump.fun",
        url: `https://pump.fun/coin/${encodeURIComponent(r.address)}`,
      });
    return out;
  }
  return [
    {
      label: "Uniswap",
      url: `https://app.uniswap.org/swap?chain=${slug}&inputCurrency=ETH&outputCurrency=${r.checksumAddress}`,
    },
  ];
}
