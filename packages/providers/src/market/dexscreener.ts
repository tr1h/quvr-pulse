import { z } from "zod";
import { safeExternalUrl, sanitizeText, type ExternalLink, type PairInfo } from "@quvr/shared";
import { fetchJson } from "../http";

export interface MarketProvider {
  readonly name: string;
  /** All pairs for a token on the given chain (may be empty). */
  getTokenPairs(
    chainSlug: string,
    token: string,
  ): Promise<{ pairs: PairInfo[]; links: ExternalLink[]; imageUrl: string | null }>;
  /** Batched lookup for up to 30 tokens (radar refresh). */
  getTokensPairs(chainSlug: string, tokens: string[]): Promise<PairInfo[]>;
  /** Free-text search (ticker or name); Dexscreener returns at most ~30 pairs across all chains. */
  searchPairs(chainSlug: string, query: string): Promise<PairInfo[]>;
  pairUrl(chainSlug: string, pairAddress: string): string;
  tokenUrl(chainSlug: string, token: string): string;
}

const num = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });
const txn = z.object({ buys: z.number(), sells: z.number() }).nullish();
const tokenRef = z.object({
  address: z.string(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
});

const pairSchema = z
  .object({
    chainId: z.string(),
    dexId: z.string(),
    url: z.string().nullish(),
    pairAddress: z.string(),
    labels: z.array(z.string()).nullish(),
    baseToken: tokenRef,
    quoteToken: tokenRef,
    priceNative: num,
    priceUsd: num,
    txns: z.object({ m5: txn, h1: txn, h6: txn, h24: txn }).partial().nullish(),
    volume: z.object({ m5: num, h1: num, h6: num, h24: num }).partial().nullish(),
    priceChange: z.object({ m5: num, h1: num, h6: num, h24: num }).partial().nullish(),
    liquidity: z.object({ usd: num, base: num, quote: num }).partial().nullish(),
    fdv: num,
    marketCap: num,
    pairCreatedAt: z.number().nullish(),
    info: z
      .object({
        imageUrl: z.string().nullish(),
        websites: z
          .array(z.object({ url: z.string(), label: z.string().nullish() }).passthrough())
          .nullish(),
        socials: z
          .array(z.object({ url: z.string(), type: z.string().nullish() }).passthrough())
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

type RawPair = z.infer<typeof pairSchema>;

function pairKind(p: RawPair): PairInfo["kind"] {
  const labels = (p.labels ?? []).map((l) => l.toLowerCase());
  if (p.chainId === "solana") {
    if (labels.some((l) => ["clmm", "dlmm", "whirlpool", "cl"].includes(l)) || p.dexId === "orca")
      return "v3";
    return SOLANA_CPMM.has(p.dexId) ? "v2" : "unknown";
  }
  if (labels.includes("v4") || p.pairAddress.length === 66) return "v4";
  if (labels.includes("v3")) return "v3";
  if (labels.includes("v2")) return "v2";
  return "unknown";
}

const IMAGE_HOSTS = new Set(["cdn.dexscreener.com", "dd.dexscreener.com"]);

/** EVM addresses are lowercased; Solana base58 is case-sensitive and kept as-is. */
const normAddr = (a: string) => (a.startsWith("0x") ? a.toLowerCase() : a);

/** Solana constant-product venues (x*y=k); concentrated venues are labelled by Dexscreener. */
const SOLANA_CPMM = new Set(["pumpswap", "pumpfun", "raydium", "meteora", "moonshot", "launchlab"]);

export function normalizePair(p: RawPair): PairInfo {
  const t = (x: z.infer<typeof txn>) => (x ? { buys: x.buys, sells: x.sells } : null);
  return {
    pairAddress: normAddr(p.pairAddress),
    dexId: sanitizeText(p.dexId, 32) ?? "unknown",
    labels: (p.labels ?? []).map((l) => sanitizeText(l, 16)).filter((l): l is string => !!l),
    kind: pairKind(p),
    baseToken: {
      address: normAddr(p.baseToken.address),
      symbol: sanitizeText(p.baseToken.symbol, 24),
      name: sanitizeText(p.baseToken.name, 64),
    },
    quoteToken: {
      address: normAddr(p.quoteToken.address),
      symbol: sanitizeText(p.quoteToken.symbol, 24),
      name: sanitizeText(p.quoteToken.name, 64),
    },
    priceUsd: p.priceUsd,
    priceNative: p.priceNative,
    liquidityUsd: p.liquidity?.usd ?? null,
    liquidityBase: p.liquidity?.base ?? null,
    liquidityQuote: p.liquidity?.quote ?? null,
    volume: {
      m5: p.volume?.m5 ?? null,
      h1: p.volume?.h1 ?? null,
      h6: p.volume?.h6 ?? null,
      h24: p.volume?.h24 ?? null,
    },
    txns: { m5: t(p.txns?.m5), h1: t(p.txns?.h1), h6: t(p.txns?.h6), h24: t(p.txns?.h24) },
    priceChange: {
      m5: p.priceChange?.m5 ?? null,
      h1: p.priceChange?.h1 ?? null,
      h6: p.priceChange?.h6 ?? null,
      h24: p.priceChange?.h24 ?? null,
    },
    fdvUsd: p.fdv,
    marketCapUsd: p.marketCap,
    pairCreatedAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
    url: safeExternalUrl(p.url),
  };
}

function extractLinks(pairs: RawPair[]): { links: ExternalLink[]; imageUrl: string | null } {
  const seen = new Set<string>();
  const links: ExternalLink[] = [];
  let imageUrl: string | null = null;
  for (const p of pairs) {
    const info = p.info;
    if (!info) continue;
    const img = safeExternalUrl(info.imageUrl);
    if (!imageUrl && img && IMAGE_HOSTS.has(new URL(img).hostname) && img.startsWith("https://"))
      imageUrl = img;
    for (const w of info.websites ?? []) {
      const url = safeExternalUrl(w.url);
      if (url && !seen.has(url)) {
        seen.add(url);
        links.push({ label: sanitizeText(w.label, 24) ?? "Website", url, kind: "website" });
      }
    }
    for (const s of info.socials ?? []) {
      const url = safeExternalUrl(s.url);
      if (url && !seen.has(url)) {
        seen.add(url);
        links.push({ label: sanitizeText(s.type, 24) ?? "Social", url, kind: "social" });
      }
    }
  }
  return { links: links.slice(0, 12), imageUrl };
}

const BASE = "https://api.dexscreener.com";

export class DexscreenerMarketProvider implements MarketProvider {
  readonly name = "dexscreener";

  private async fetchPairs(chainSlug: string, tokens: string[]): Promise<RawPair[]> {
    const json = await fetchJson(this.name, `${BASE}/tokens/v1/${chainSlug}/${tokens.join(",")}`, {
      timeoutMs: 8_000,
    });
    const arr = z.array(z.unknown()).safeParse(json);
    if (!arr.success) return [];
    // Validate pair-by-pair so one malformed entry cannot hide the others.
    return arr.data.flatMap((p) => {
      const r = pairSchema.safeParse(p);
      return r.success ? [r.data] : [];
    });
  }

  async getTokenPairs(chainSlug: string, token: string) {
    const raw = await this.fetchPairs(chainSlug, [token]);
    const own = raw.filter((p) => p.chainId === chainSlug);
    const pairs = own
      .map(normalizePair)
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    return { pairs, ...extractLinks(own) };
  }

  async getTokensPairs(chainSlug: string, tokens: string[]) {
    if (tokens.length === 0) return [];
    const out: PairInfo[] = [];
    for (let i = 0; i < tokens.length; i += 30) {
      const raw = await this.fetchPairs(chainSlug, tokens.slice(i, i + 30));
      out.push(...raw.filter((p) => p.chainId === chainSlug).map(normalizePair));
    }
    return out;
  }

  async searchPairs(chainSlug: string, query: string) {
    const q = query.trim().slice(0, 40);
    if (!q) return [];
    const json = await fetchJson(this.name, `${BASE}/latest/dex/search?q=${encodeURIComponent(q)}`, {
      timeoutMs: 8_000,
    });
    const arr = z.object({ pairs: z.array(z.unknown()).nullish() }).safeParse(json);
    if (!arr.success) return [];
    return (arr.data.pairs ?? []).flatMap((p) => {
      const r = pairSchema.safeParse(p);
      return r.success && r.data.chainId === chainSlug ? [normalizePair(r.data)] : [];
    });
  }

  pairUrl(chainSlug: string, pairAddress: string) {
    return `https://dexscreener.com/${chainSlug}/${pairAddress}`;
  }

  tokenUrl(chainSlug: string, token: string) {
    return `https://dexscreener.com/${chainSlug}/${token}`;
  }
}
