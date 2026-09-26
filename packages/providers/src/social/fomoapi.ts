import WebSocket from "ws";
import { isEvmAddress, isSolanaAddress, logger, sanitizeText } from "@quvr/shared";
import { ProviderError } from "../errors";
import { fetchJson } from "../http";
import type {
  SocialLeaderboardTrader,
  SocialAlert,
  SocialProvider,
  SocialThesis,
  SocialTrade,
  SocialTrendingToken,
  SocialUser,
} from "./types";

/**
 * FomoAPI.io — an independent, unofficial data provider (not affiliated with fomo.family).
 * Only its documented public API is used, with our own server-side key. We never call
 * fomo.family private endpoints, never use user cookies or bearer tokens from browsers.
 */
const BASE = "https://api.fomoapi.io";
const WS_URL = "wss://api.fomoapi.io/ws/alerts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === "string" ? sanitizeText(v, max) : null);
const numOrNull = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const addr = (v: unknown) => (typeof v === "string" && isEvmAddress(v) ? v.toLowerCase() : null);
/** Token address on either chain: EVM lowercased, Solana base58 kept as-is. */
const tokenAddr = (v: unknown) =>
  typeof v === "string"
    ? isEvmAddress(v)
      ? v.toLowerCase()
      : isSolanaAddress(v)
        ? v
        : null
    : null;

function toIso(v: unknown): string | null {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
    const n = Number(v);
    if (Number.isFinite(n)) return toIso(n);
  }
  return null;
}

function firstArray(json: unknown, keys: string[]): unknown[] {
  if (Array.isArray(json)) return json;
  if (!isObj(json)) return [];
  for (const k of keys) if (Array.isArray(json[k])) return json[k] as unknown[];
  return [];
}

/** "X posted a thesis on $SYM: <body>" → "<body>" (sanitized, never rendered as HTML). */
export function thesisBody(msg: Obj): string | null {
  const raw = isObj(msg.raw) && typeof msg.raw.text === "string" ? msg.raw.text : msg.text;
  if (typeof raw !== "string") return null;
  const m = /posted a thesis on \$[^:]*:\s*([\s\S]*)$/i.exec(raw);
  return sanitizeText(m ? m[1] : raw, 1000);
}

function parseThesis(t: unknown): SocialThesis | null {
  if (!isObj(t)) return null;
  const token = isObj(t.token) ? t.token : {};
  const handle = str(t.handle, 64);
  const createdAt = toIso(t.ts ?? t.createdAt);
  const text = typeof t.text === "string" ? sanitizeText(t.text, 1000) : null;
  if (!handle || !createdAt || !text) return null;
  return {
    id: String(t.id ?? `${handle}-${createdAt}`),
    tradeId: t.tradeId ? String(t.tradeId) : null,
    handle,
    displayName: str(t.name, 64),
    userId: t.userId ? String(t.userId) : null,
    text,
    createdAt,
    likes: numOrNull(t.likes),
    isDev: typeof t.isDev === "boolean" ? t.isDev : null,
    tradeUsd: numOrNull(t.tradeUsd),
    tokenAddress: tokenAddr(token.address),
    chain: str(t.chain, 24),
  };
}

/**
 * Credit budget hook (installed by the services layer, shared through Redis):
 * reserve() is asked before every paid request with the documented cost; record() receives the
 * real cost from the x-credits-cost header.
 */
export type FomoCreditGuard = {
  reserve(estimate: number, endpoint: string): Promise<boolean>;
  record(cost: number, remaining: number | null, endpoint: string): Promise<void>;
};

/** Documented costs (credits) used for budgeting before a call is made. */
export const FOMO_COSTS = { read: 250, thesis: 1_250, profile: 2_500 } as const;

export class FomoApiSocialProvider implements SocialProvider {
  readonly name = "fomoapi";
  creditGuard: FomoCreditGuard | null = null;

  constructor(private readonly apiKey: string | undefined) {}

  isEnabled() {
    return !!this.apiKey;
  }

  /**
   * Measured 2026-09-23: most reads answer in < 5 s, but wallet resolution (/v2/users/{handle},
   * 2 500 credits) took ~45 s and is billed even if we time out — so it gets a long timeout and
   * no retries. Upstream 502 "upstream_unavailable" is not billed and is retried.
   */
  private async get(
    path: string,
    opts: { timeoutMs?: number; retries?: number; group?: string; cost?: number } = {},
  ): Promise<unknown> {
    if (!this.apiKey)
      throw new ProviderError(this.name, "disabled", "FOMO_API_KEY is not set", {
        retryable: false,
      });
    // Separate circuit breakers per endpoint group: a flaky upstream (trade history) must not
    // block healthy endpoints (theses, profiles, leaderboards).
    const source = opts.group ? `${this.name}-${opts.group}` : this.name;
    const endpoint = path
      .split("?")[0]!
      .replace(/0x[0-9a-fA-F]{40}/g, ":address")
      .replace(/\/[1-9A-HJ-NP-Za-km-z]{32,44}(?=\/|$)/g, "/:address");
    const estimate = opts.cost ?? FOMO_COSTS.read;
    if (this.creditGuard && !(await this.creditGuard.reserve(estimate, endpoint))) {
      throw new ProviderError(
        this.name,
        "rate-limited",
        "FomoAPI call not allowed: daily credit cap reached or no shared credit counter (Redis)",
        {
          retryable: false,
        },
      );
    }
    const guard = this.creditGuard;
    const json = await fetchJson(source, `${BASE}${path}`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
      allowNotFound: true,
      timeoutMs: opts.timeoutMs ?? 20_000,
      retries: opts.retries ?? 1,
      onResponse: (res) => {
        const cost = Number(res.headers.get("x-credits-cost") ?? "NaN");
        const remaining = Number(res.headers.get("x-credits-remaining") ?? "NaN");
        if (guard && Number.isFinite(cost)) {
          void guard.record(cost, Number.isFinite(remaining) ? remaining : null, endpoint);
        }
      },
    });
    if (isObj(json) && json.available === false) return null;
    return json;
  }

  async getTrendingTokens(chain: string, limit = 25): Promise<SocialTrendingToken[]> {
    const json = await this.get(`/v2/leaderboard/tokens/trending?limit=${limit}`);
    return firstArray(json, ["tokens"]).flatMap((row): SocialTrendingToken[] => {
      if (!isObj(row)) return [];
      const token = isObj(row.token) ? row.token : {};
      const address = tokenAddr(token.address);
      // "network" is a numeric chain id (4663 = Robinhood, 1399811149 = Solana, 56, 8453, 1).
      const networkId = numOrNull(row.network);
      const network = networkId !== null ? String(networkId) : str(row.network, 24);
      if (!address) return [];
      const wanted = chain === "robinhood" ? 4663 : Number(chain);
      if (
        networkId !== null ? networkId !== wanted : !(network ?? "").toLowerCase().includes(chain)
      )
        return [];
      return [
        {
          rank: numOrNull(row.rank) ?? 0,
          address,
          name: str(token.name, 64),
          symbol: str(token.symbol, 24),
          chain: network,
          holders: numOrNull(row.holders),
          priceUsd: numOrNull(row.priceUsd),
          change24h: numOrNull(row.change24h),
          marketCapUsd: numOrNull(row.marketCapUsd),
          volume24hUsd: numOrNull(row.volume24hUsd),
        },
      ];
    });
  }

  async getTokenTheses(token: string, limit = 50, network?: "sol"): Promise<SocialThesis[]> {
    const net = network ? `&network=${network}` : "";
    const json = await this.get(`/v2/thesis/token/${token}?limit=${limit}&sort=recent${net}`, {
      cost: FOMO_COSTS.thesis,
    });
    return firstArray(json, ["theses"])
      .map(parseThesis)
      .filter((t): t is SocialThesis => !!t);
  }

  async getRecentTheses(chain: string, limit = 100): Promise<SocialThesis[]> {
    const json = await this.get(`/v2/thesis?chain=${encodeURIComponent(chain)}&limit=${limit}`, {
      timeoutMs: 45_000,
      cost: FOMO_COSTS.thesis,
    });
    return firstArray(json, ["theses"])
      .map(parseThesis)
      .filter((t): t is SocialThesis => !!t && !!t.tokenAddress);
  }

  async getUserTheses(handle: string, limit = 50): Promise<SocialThesis[]> {
    const json = await this.get(
      `/v2/thesis/user/${encodeURIComponent(handle)}?limit=${limit}&chain=robinhood&sort=recent`,
    );
    return firstArray(json, ["theses"])
      .map(parseThesis)
      .filter((t): t is SocialThesis => !!t);
  }

  async getLeaderboard(window: "24h" | "7d" | "30d" | "all"): Promise<SocialLeaderboardTrader[]> {
    const json = await this.get(`/v2/leaderboard/${window}`, { timeoutMs: 45_000 });
    return firstArray(json, ["traders"]).flatMap((t): SocialLeaderboardTrader[] => {
      if (!isObj(t)) return [];
      const handle = str(t.handle, 64);
      const wallets = isObj(t.wallets) ? t.wallets : {};
      return handle
        ? [
            {
              handle,
              userId: t.userId ? String(t.userId) : null,
              displayName: str(t.displayName, 64),
              evmWallet: addr(wallets.evm),
            },
          ]
        : [];
    });
  }

  async getUser(handle: string): Promise<SocialUser | null> {
    const u = await this.get(`/v2/users/${encodeURIComponent(handle)}`, {
      timeoutMs: 90_000,
      retries: 0,
      group: "profile",
      cost: FOMO_COSTS.profile,
    });
    if (!isObj(u)) return null;
    const wallets = isObj(u.wallets) ? u.wallets : {};
    return {
      handle: str(u.handle, 64) ?? handle,
      userId: u.userId ? String(u.userId) : null,
      displayName: str(u.displayName, 64),
      verified: typeof u.verified === "boolean" ? u.verified : null,
      evmWallet: addr(wallets.evm),
      pnlUsdAll: numOrNull(u.pnlUsd),
      trades: numOrNull(u.trades),
      averageHoldTimeSeconds: numOrNull(u.averageHoldTimeSeconds),
    };
  }

  async getUserTrades(handle: string): Promise<SocialTrade[]> {
    const json = await this.get(`/v2/users/${encodeURIComponent(handle)}/trades?cursor=start`, {
      group: "trades",
    });
    return firstArray(json, ["trades", "items"]).flatMap((t): SocialTrade[] => {
      if (!isObj(t)) return [];
      const token = isObj(t.token) ? t.token : {};
      const side = t.side === "buy" || t.side === "sell" ? t.side : null;
      const status =
        t.status === "open" || t.status === "closed" ? t.status : t.closedAt ? "closed" : null;
      return [
        {
          tradeId: t.tradeId ? String(t.tradeId) : null,
          tokenAddress: addr(token.address),
          chain: str(t.chain, 24),
          side,
          status,
          sizeUsd: numOrNull(t.sizeUsd),
          realizedPnlUsd: numOrNull(t.realizedPnlUsd),
          openedAt: toIso(t.createdAt ?? t.ts),
          closedAt: toIso(t.closedAt),
        },
      ];
    });
  }

  async getTokenTrackedHolders(token: string) {
    const json = await this.get(`/token/${token}/holders?limit=50`);
    return firstArray(json, ["holders"]).flatMap((h) => {
      if (!isObj(h)) return [];
      const handle = str(h.handle, 64);
      return handle ? [{ handle, valueUsd: numOrNull(h.valueUsd) }] : [];
    });
  }

  subscribeAlerts(
    chain: string,
    onAlert: (a: SocialAlert) => void,
    onStatus?: (s: string) => void,
  ): () => void {
    if (!this.apiKey) {
      onStatus?.("disabled");
      return () => {};
    }
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    const log = logger.child({ source: this.name, stream: "ws/alerts" });

    const connect = () => {
      if (closed) return;
      const url = `${WS_URL}?chain=${encodeURIComponent(chain)}&key=${encodeURIComponent(this.apiKey!)}`;
      ws = new WebSocket(url, { handshakeTimeout: 10_000, maxPayload: 1024 * 1024 });
      ws.on("open", () => {
        attempt = 0;
        onStatus?.("connected");
        log.info("connected");
      });
      ws.on("message", (buf) => {
        let msg: unknown;
        try {
          msg = JSON.parse(buf.toString());
        } catch {
          return;
        }
        if (!isObj(msg) || msg.type !== "alert") return;
        const kind = String(
          msg.side ?? msg.kind ?? msg.alertType ?? msg.eventType ?? "",
        ).toLowerCase();
        onAlert({
          eventId: String(msg.eventId ?? `${Date.now()}-${Math.random()}`),
          type: kind.includes("thesis")
            ? "thesis"
            : kind.includes("sell")
              ? "sell"
              : kind.includes("buy")
                ? "buy"
                : "other",
          handle: str(msg.handle ?? msg.trader, 64),
          userId: msg.userId ? String(msg.userId) : null,
          tokenAddress: addr(msg.tokenAddress),
          chainId: numOrNull(msg.chainId),
          // tradeUsd is the fill size; usdValue may be the position mark, so it is not used as size.
          tradeUsd: numOrNull(msg.tradeUsd),
          realizedPnlUsd: numOrNull(msg.realizedPnlUsd),
          tradeId: msg.tradeId ? String(msg.tradeId) : null,
          text: kind.includes("thesis") ? thesisBody(msg) : null,
          tokenSymbol: str(msg.token, 24),
          replay: msg.replay === true,
          at: toIso(msg.ts ?? msg.timestamp) ?? new Date().toISOString(),
        });
      });
      ws.on("close", () => {
        onStatus?.("disconnected");
        if (closed) return;
        attempt++;
        const delay = Math.min(60_000, 1_000 * 2 ** attempt) * (0.5 + Math.random() / 2);
        setTimeout(connect, delay);
      });
      ws.on("error", (e) => log.warn("ws error", { error: e.message }));
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }
}
