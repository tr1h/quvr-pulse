import { ProviderError } from "./errors";
import { withResilience, type ResilienceOptions } from "./resilience";

/**
 * SSRF protection: outbound requests are only allowed to an explicit host allowlist.
 * User input never becomes a URL host — it is only ever a validated address in a path —
 * but the allowlist is a second line of defence (and blocks redirects to other hosts).
 */
const STATIC_ALLOWED_HOSTS = new Set([
  "rpc.mainnet.chain.robinhood.com",
  "rpc.testnet.chain.robinhood.com",
  "robinhoodchain.blockscout.com",
  "explorer.testnet.chain.robinhood.com",
  "api.blockscout.com",
  "api.dexscreener.com",
  "api.geckoterminal.com",
  "api.fomoapi.io",
  "api.telegram.org",
  "api.mainnet-beta.solana.com",
  "api.helius.xyz",
  "mainnet.base.org",
  "base.blockscout.com",
]);
const ALLOWED_SUFFIXES = [".g.alchemy.com", ".helius-rpc.com", ".quiknode.pro"];
const EXTRA_ALLOWED = new Set<string>();

/** Operator-configured hosts (e.g. a custom ROBINHOOD_RPC_URL) are added at startup. */
export function allowHost(url: string) {
  try {
    EXTRA_ALLOWED.add(new URL(url).hostname.toLowerCase());
  } catch {
    /* ignore invalid */
  }
}

const PRIVATE_IP =
  /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|::1$|fc|fd|fe80:|localhost$)/i;

export function assertAllowedUrl(source: string, raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError(source, "ssrf", "invalid URL", { retryable: false });
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") {
    throw new ProviderError(source, "ssrf", "only https is allowed", { retryable: false });
  }
  if (PRIVATE_IP.test(host)) {
    throw new ProviderError(source, "ssrf", "private address blocked", { retryable: false });
  }
  const ok =
    STATIC_ALLOWED_HOSTS.has(host) ||
    EXTRA_ALLOWED.has(host) ||
    ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
  if (!ok)
    throw new ProviderError(source, "ssrf", `host not allowed: ${host}`, { retryable: false });
  return url;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type FetchJsonOptions = ResilienceOptions & {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /** 404 → resolves to null instead of throwing. */
  allowNotFound?: boolean;
  /** Called with every response (e.g. to read metering headers), before status handling. */
  onResponse?: (res: Response) => void;
};

export async function fetchJson<T = unknown>(
  source: string,
  rawUrl: string,
  opts: FetchJsonOptions = {},
): Promise<T | null> {
  const url = assertAllowedUrl(source, rawUrl);
  return withResilience(
    source,
    async (signal) => {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          accept: "application/json",
          "user-agent": "QUVR-Pulse/0.1 (+independent read-only analytics)",
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
          ...opts.headers,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal,
        redirect: "error",
        cache: "no-store",
      });

      opts.onResponse?.(res);
      const contentType = res.headers.get("content-type") ?? "";
      const len = Number(res.headers.get("content-length") ?? "0");
      if (len > MAX_BODY_BYTES) {
        throw new ProviderError(source, "invalid-response", "response too large", {
          retryable: false,
        });
      }
      const text = await res.text();
      if (text.length > MAX_BODY_BYTES) {
        throw new ProviderError(source, "invalid-response", "response too large", {
          retryable: false,
        });
      }

      if (res.status === 404 && opts.allowNotFound) return null;
      if (res.status === 401 || res.status === 403) {
        const challenge = /just a moment|cf-chl|challenge-platform/i.test(text);
        throw new ProviderError(
          source,
          challenge ? "blocked" : "unauthorized",
          challenge
            ? "blocked by bot protection (not bypassed by design)"
            : `unauthorized (${res.status})`,
          { status: res.status, retryable: false },
        );
      }
      if (res.status === 402) {
        throw new ProviderError(source, "payment-required", "API key or credits required", {
          status: 402,
          retryable: false,
        });
      }
      if (res.status === 404) {
        throw new ProviderError(source, "not-found", "not found", {
          status: 404,
          retryable: false,
        });
      }
      if (res.status === 429) {
        throw new ProviderError(source, "rate-limited", "rate limited by provider", {
          status: 429,
        });
      }
      if (!res.ok) {
        throw new ProviderError(source, "http", `HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      if (!contentType.includes("json") && !/^\s*[[{]/.test(text)) {
        throw new ProviderError(source, "invalid-response", "non-JSON response", {
          retryable: false,
        });
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ProviderError(source, "invalid-response", "malformed JSON", { retryable: false });
      }
    },
    opts,
  );
}
