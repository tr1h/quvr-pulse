import { logger } from "@quvr/shared";
import { ProviderError } from "./errors";

// ---------------------------------------------------------------- metrics

type SourceMetrics = {
  calls: number;
  successes: number;
  failures: number;
  latencies: number[]; // ring buffer of recent successful latencies
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

const METRICS = new Map<string, SourceMetrics>();
const LATENCY_WINDOW = 200;

function metricsFor(source: string): SourceMetrics {
  let m = METRICS.get(source);
  if (!m) {
    m = {
      calls: 0,
      successes: 0,
      failures: 0,
      latencies: [],
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
    };
    METRICS.set(source, m);
  }
  return m;
}

export function recordSuccess(source: string, latencyMs: number) {
  const m = metricsFor(source);
  m.calls++;
  m.successes++;
  m.latencies.push(latencyMs);
  if (m.latencies.length > LATENCY_WINDOW) m.latencies.shift();
  m.lastSuccessAt = new Date().toISOString();
}

export function recordFailure(source: string, error: string) {
  const m = metricsFor(source);
  m.calls++;
  m.failures++;
  m.lastErrorAt = new Date().toISOString();
  m.lastError = error.slice(0, 300);
}

export type MetricsSnapshot = {
  source: string;
  calls: number;
  successes: number;
  failures: number;
  successRate: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  circuit: CircuitState;
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] ?? 0);
}

export function metricsSnapshot(): MetricsSnapshot[] {
  return [...METRICS.entries()].map(([source, m]) => ({
    source,
    calls: m.calls,
    successes: m.successes,
    failures: m.failures,
    successRate: m.calls ? m.successes / m.calls : null,
    p50LatencyMs: percentile(m.latencies, 50),
    p95LatencyMs: percentile(m.latencies, 95),
    lastSuccessAt: m.lastSuccessAt,
    lastErrorAt: m.lastErrorAt,
    lastError: m.lastError,
    circuit: breakerFor(source).state,
  }));
}

// ---------------------------------------------------------------- circuit breaker

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  state: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;

  constructor(
    readonly source: string,
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  canPass(): boolean {
    if (this.state === "open") {
      if (this.now() - this.openedAt >= this.cooldownMs) {
        this.state = "half-open";
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  onFailure() {
    this.failures++;
    if (this.state === "half-open" || this.failures >= this.threshold) {
      if (this.state !== "open") logger.warn("circuit opened", { source: this.source });
      this.state = "open";
      this.openedAt = this.now();
    }
  }
}

const BREAKERS = new Map<string, CircuitBreaker>();
export function breakerFor(source: string): CircuitBreaker {
  let b = BREAKERS.get(source);
  if (!b) {
    b = new CircuitBreaker(source);
    BREAKERS.set(source, b);
  }
  return b;
}

// ---------------------------------------------------------------- rate limiter (token bucket)

export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((t - this.last) / 1000) * this.refillPerSec,
    );
    this.last = t;
  }

  /** Waits for a token up to maxWaitMs; returns false if the budget is exhausted. */
  async acquire(maxWaitMs = 5_000): Promise<boolean> {
    const deadline = this.now() + maxWaitMs;
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }
      const waitMs = Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
      if (this.now() + waitMs > deadline) return false;
      await sleep(Math.min(waitMs, 1_000));
    }
  }
}

const LIMITERS = new Map<string, RateLimiter>();
/** Per-source client-side budgets, below the documented provider limits. */
const LIMITS: Record<string, [capacity: number, perSec: number]> = {
  rpc: [8, 6], // public RPC answers 429 above ~10 req/s
  "rpc-logs": [1, 0.6], // heavy eth_getLogs: measured budget ≈ 1 request / 1.5 s
  "base-rpc": [4, 3], // public mainnet.base.org throttles eth_call bursts
  "base-rpc-logs": [1, 1],
  alchemy: [25, 20],
  blockscout: [5, 4],
  dexscreener: [10, 4], // documented 300 req/min
  geckoterminal: [2, 0.2], // free tier: documented 30 req/min, in practice 429s well below that
  "solana-rpc": [8, 8], // keyed providers allow ~10 req/s on free plans; public one is stricter
  "helius-enhanced": [2, 2],
  fomoapi: [3, 0.5], // credit-metered; keep it gentle
  telegram: [20, 20],
};

export function limiterFor(source: string): RateLimiter {
  let l = LIMITERS.get(source);
  if (!l) {
    // Endpoint groups (e.g. "fomoapi-trades") share the budget of their provider.
    const [cap, rate] = LIMITS[source] ?? LIMITS[source.split("-")[0]!] ?? [10, 5];
    l = new RateLimiter(cap, rate);
    LIMITERS.set(source, l);
  }
  return l;
}

// ---------------------------------------------------------------- retry wrapper

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sources whose 429 means "this whole IP is over quota" (GeckoTerminal's free API): instead of
 * retrying, every caller pauses together — 20 s, doubling up to 2 min while 429s continue.
 */
const COOLDOWN_ON_429 = new Set(["geckoterminal"]);
const COOLDOWN = new Map<string, { until: number; ms: number }>();

export type ResilienceOptions = {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Skip the circuit breaker (used by cheap health probes). */
  bypassBreaker?: boolean;
  /** Separate client-side budget for expensive calls (e.g. "rpc-logs"). */
  limiterKey?: string;
};

/**
 * Runs `fn` with: rate limiting, circuit breaker, per-attempt timeout (AbortSignal),
 * retry with exponential backoff + full jitter on retryable errors, and metrics.
 */
export async function withResilience<T>(
  source: string,
  fn: (signal: AbortSignal) => Promise<T>,
  opts: ResilienceOptions = {},
): Promise<T> {
  const { timeoutMs = 10_000, retries = 2, baseDelayMs = 300, maxDelayMs = 4_000 } = opts;
  const breaker = breakerFor(source);
  const pause = COOLDOWN.get(source);
  if (pause && Date.now() < pause.until) {
    throw new ProviderError(source, "rate-limited", "provider cooldown after 429", {
      retryable: false,
    });
  }
  if (!opts.bypassBreaker && !breaker.canPass()) {
    throw new ProviderError(source, "circuit-open", "circuit breaker open", { retryable: false });
  }

  let lastErr: unknown;
  let maxAttempts = retries;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    if (!(await limiterFor(opts.limiterKey ?? source).acquire(opts.limiterKey ? 60_000 : 5_000))) {
      lastErr = new ProviderError(
        source,
        "rate-limited",
        "client-side rate limit budget exhausted",
      );
      recordFailure(source, "client rate limit");
      break;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();
    try {
      const result = await fn(controller.signal);
      recordSuccess(source, performance.now() - started);
      breaker.onSuccess();
      COOLDOWN.delete(source);
      return result;
    } catch (e) {
      const err =
        controller.signal.aborted && !(e instanceof ProviderError)
          ? new ProviderError(source, "timeout", `timed out after ${timeoutMs}ms`)
          : e;
      lastErr = err;
      const retryable = err instanceof ProviderError ? err.retryable : true;
      recordFailure(source, err instanceof Error ? err.message : String(err));
      const rateLimited = err instanceof ProviderError && err.kind === "rate-limited";
      // Client errors (4xx, not-found, invalid input) and provider backpressure (429)
      // must not trip the breaker; 429 gets extra, slower retries instead.
      if (retryable && !rateLimited) breaker.onFailure();
      if (rateLimited && COOLDOWN_ON_429.has(source)) {
        const ms = Math.min((COOLDOWN.get(source)?.ms ?? 10_000) * 2, 120_000);
        COOLDOWN.set(source, { until: Date.now() + ms, ms });
        break;
      }
      if (rateLimited) maxAttempts = Math.max(maxAttempts, 4);
      if (!retryable || attempt >= maxAttempts) break;
      const base = rateLimited ? Math.max(baseDelayMs, 1_000) : baseDelayMs;
      const cap = rateLimited ? Math.max(maxDelayMs, 8_000) : maxDelayMs;
      const exp = Math.min(cap, base * 2 ** attempt);
      // Full jitter, with a floor for 429 so we actually back off.
      await sleep(rateLimited ? exp / 2 + (Math.random() * exp) / 2 : Math.random() * exp);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
