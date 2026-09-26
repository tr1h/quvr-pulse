import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertAllowedUrl,
  CircuitBreaker,
  fetchJson,
  normalizePair,
  ProviderError,
  RateLimiter,
  withResilience,
} from "../src";

afterEach(() => vi.unstubAllGlobals());

describe("withResilience", () => {
  it("retries retryable errors and then succeeds", async () => {
    let n = 0;
    const r = await withResilience(
      "test-retry",
      async () => {
        if (++n < 3) throw new ProviderError("test-retry", "http", "boom", { status: 503 });
        return "ok";
      },
      { retries: 3, baseDelayMs: 1 },
    );
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let n = 0;
    await expect(
      withResilience("test-noretry", async () => {
        n++;
        throw new ProviderError("test-noretry", "not-found", "nope", { retryable: false });
      }),
    ).rejects.toThrow("nope");
    expect(n).toBe(1);
  });

  it("times out slow calls via AbortSignal", async () => {
    await expect(
      withResilience(
        "test-timeout",
        (signal) =>
          new Promise((_, rej) =>
            signal.addEventListener("abort", () => rej(new Error("aborted"))),
          ),
        { timeoutMs: 20, retries: 0 },
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("CircuitBreaker", () => {
  it("opens after N failures and half-opens after cooldown", () => {
    let now = 0;
    const b = new CircuitBreaker("x", 3, 1000, () => now);
    b.onFailure();
    b.onFailure();
    expect(b.canPass()).toBe(true);
    b.onFailure();
    expect(b.state).toBe("open");
    expect(b.canPass()).toBe(false);
    now = 1500;
    expect(b.canPass()).toBe(true);
    expect(b.state).toBe("half-open");
    b.onFailure();
    expect(b.state).toBe("open");
    now = 3000;
    b.canPass();
    b.onSuccess();
    expect(b.state).toBe("closed");
  });
});

describe("RateLimiter", () => {
  it("refuses when the budget cannot be met within maxWait", async () => {
    const now = 0;
    const l = new RateLimiter(1, 0.001, () => now);
    expect(await l.acquire(0)).toBe(true);
    expect(await l.acquire(0)).toBe(false);
  });
});

describe("SSRF guard", () => {
  it("allows only allowlisted https hosts", () => {
    expect(() => assertAllowedUrl("t", "https://api.dexscreener.com/x")).not.toThrow();
    expect(() => assertAllowedUrl("t", "http://api.dexscreener.com/x")).toThrow(ProviderError);
    expect(() => assertAllowedUrl("t", "https://169.254.169.254/latest")).toThrow(ProviderError);
    expect(() => assertAllowedUrl("t", "https://evil.example.com/")).toThrow(/not allowed/);
    expect(() => assertAllowedUrl("t", "https://localhost/")).toThrow();
  });
});

describe("fetchJson", () => {
  it("classifies a Cloudflare challenge as blocked (and does not retry)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<html><title>Just a moment...</title>", {
          status: 403,
          headers: { "content-type": "text/html" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchJson("blockscout-t", "https://robinhoodchain.blockscout.com/api/v2/x"),
    ).rejects.toMatchObject({ kind: "blocked" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on 404 when allowed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    expect(
      await fetchJson("t404", "https://api.dexscreener.com/x", { allowNotFound: true }),
    ).toBeNull();
  });
});

describe("Dexscreener normalization", () => {
  it("parses a real v4 pair and sanitizes links", () => {
    const p = normalizePair({
      chainId: "robinhood",
      dexId: "uniswap",
      url: "https://dexscreener.com/robinhood/0xd4948bc5cba2766bf51b669a8b27bd66e108d69fc8e19a43cc44db8336742dc4",
      pairAddress: "0xd4948bc5cba2766bf51b669a8b27bd66e108d69fc8e19a43cc44db8336742dc4",
      labels: ["v4"],
      baseToken: {
        address: "0x4B7d1E5ec6889e63e70D39561edf925095dbed88",
        name: "RHTools<script>",
        symbol: "TOOLS",
      },
      quoteToken: {
        address: "0x0000000000000000000000000000000000000000",
        name: "Ether",
        symbol: "ETH",
      },
      priceNative: 9.488e-8,
      priceUsd: 0.0002574,
      txns: { m5: { buys: 3, sells: 1 } },
      volume: { h24: 25455.76 },
      priceChange: { h1: 7.95 },
      liquidity: { usd: 48928.73, base: 95043889, quote: 9.01838 },
      fdv: 257378,
      marketCap: 257378,
      pairCreatedAt: 1789323811000,
    } as never);
    expect(p.kind).toBe("v4");
    expect(p.baseToken.address).toBe("0x4b7d1e5ec6889e63e70d39561edf925095dbed88");
    expect(p.baseToken.name).toBe("RHTools");
    expect(p.priceChange.m5).toBeNull(); // missing stays null, never 0
    expect(p.txns.h24).toBeNull();
    expect(p.liquidityUsd).toBe(48928.73);
  });
});

describe("FomoAPI adapter (real response shapes, 2026-09-23)", () => {
  it("keeps only Robinhood (network 4663) tokens from the trending board", async () => {
    const { FomoApiSocialProvider } = await import("../src");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          board: "trending",
          tokens: [
            {
              rank: 1,
              network: 1399811149,
              token: {
                name: "Bluf",
                symbol: "BLUF",
                address: "c4AtfqMRbC9FuHtVEHDhCm453tytU9E34MXXrp6bLuf",
              },
            },
            {
              rank: 4,
              network: 4663,
              token: {
                name: "AI",
                symbol: "AI",
                address: "0x2e8c31162b855a2ffa90f6f8634643ad6f111e18",
              },
              marketCapUsd: 1000,
            },
            {
              rank: 21,
              network: 56,
              token: {
                name: "BREW",
                symbol: "BREW",
                address: "0xfa6d9b504848606eb9aec04ccc161d169b3f2159",
              },
            },
          ],
        }),
      ),
    );
    const rows = await new FomoApiSocialProvider("fapi_test_key_123").getTrendingTokens(
      "robinhood",
    );
    expect(rows.map((r) => r.symbol)).toEqual(["AI"]);
    expect(rows[0]!.chain).toBe("4663");
  });
});

describe("thesisBody", () => {
  it("extracts the thesis text from a stream alert", async () => {
    const { thesisBody } = await import("../src");
    expect(
      thesisBody({
        text: "ThreeQuartersFull posted a thesis on $MOONCOIN: Mooncoin getting crazy",
      }),
    ).toBe("Mooncoin getting crazy");
    expect(
      thesisBody({ raw: { text: "x posted a thesis on $A: <b>hi</b> there" }, text: "ignored" }),
    ).toBe("hi there");
    expect(thesisBody({ text: 42 })).toBeNull();
  });
});

describe("FomoAPI credit guard", () => {
  it("does not send a paid request when the budget is exhausted", async () => {
    const { FomoApiSocialProvider } = await import("../src");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const p = new FomoApiSocialProvider("fapi_test_key_123");
    p.creditGuard = { reserve: async () => false, record: async () => {} };
    await expect(p.getRecentTheses("robinhood")).rejects.toThrow(/credit cap/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records the real cost from x-credits-cost and reserves the documented estimate", async () => {
    const { FomoApiSocialProvider, FOMO_COSTS } = await import("../src");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { theses: [] },
          { headers: { "x-credits-cost": "1250", "x-credits-remaining": "1000" } },
        ),
      ),
    );
    const reserved: number[] = [];
    const recorded: Array<[number, number | null]> = [];
    const p = new FomoApiSocialProvider("fapi_test_key_123");
    p.creditGuard = {
      reserve: async (e) => (reserved.push(e), true),
      record: async (c, r) => void recorded.push([c, r]),
    };
    await p.getRecentTheses("robinhood");
    expect(reserved).toEqual([FOMO_COSTS.thesis]);
    expect(recorded).toEqual([[1250, 1000]]);
  });
});

describe("GeckoTerminal 429 cooldown", () => {
  it("stops calling the provider after a 429 instead of retrying", async () => {
    let calls = 0;
    const rateLimited = () => {
      calls++;
      throw new ProviderError("geckoterminal", "rate-limited", "429", { status: 429 });
    };
    await expect(withResilience("geckoterminal", async () => rateLimited())).rejects.toThrow();
    expect(calls).toBe(1);
    // While cooling down, callers fail fast without touching the provider.
    await expect(withResilience("geckoterminal", async () => rateLimited())).rejects.toThrow(
      /cooldown/,
    );
    expect(calls).toBe(1);
  });
});
