import { describe, expect, it } from "vitest";
import {
  addressSchema,
  isEvmAddress,
  normalizeAddress,
  redact,
  safeExternalUrl,
  sanitizeText,
  sourced,
  toChecksum,
  unavailable,
} from "../src";

const T = "0x4b7d1e5ec6889e63e70d39561edf925095dbed88";

describe("addresses", () => {
  it("stores lowercase and displays checksum", () => {
    expect(normalizeAddress(" 0x4B7d1E5ec6889e63e70D39561edf925095dbed88 ")).toBe(T);
    expect(toChecksum(T)).toBe("0x4B7d1E5ec6889e63e70D39561edf925095dbed88");
  });

  it("rejects malformed and bad-checksum addresses", () => {
    expect(isEvmAddress("0x123")).toBe(false);
    expect(isEvmAddress(`${T}00`)).toBe(false);
    expect(isEvmAddress("0x4B7d1E5ec6889e63e70D39561edf925095dbed8G")).toBe(false);
    expect(isEvmAddress("0x4B7D1E5ec6889e63e70D39561edf925095dbed88")).toBe(false); // wrong checksum
    expect(isEvmAddress(T.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(addressSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(addressSchema.parse(T.toUpperCase().replace("0X", "0x"))).toBe(T);
  });
});

describe("sanitization", () => {
  it("strips markup, control and bidi characters from token metadata", () => {
    expect(sanitizeText('<img src=x onerror="alert(1)">Evil‮Token\u0000')).toBe(
      "Evil Token".replace(" ", ""),
    );
    expect(sanitizeText("   ")).toBeNull();
    expect(sanitizeText(42)).toBeNull();
    expect(sanitizeText("a".repeat(200), 10)).toHaveLength(10);
  });

  it("allows only http(s) links without credentials", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("https://user:pw@example.com")).toBeNull();
    expect(safeExternalUrl("https://www.rhtools.xyz/")).toBe("https://www.rhtools.xyz/");
  });
});

describe("SourcedValue", () => {
  it("missing values are null with an error, never zero", () => {
    const v = unavailable<number>("dexscreener", "timeout");
    expect(v.value).toBeNull();
    expect(v.error).toBe("timeout");
    expect(v.confidence).toBe("low");
    expect(sourced(undefined, "x").value).toBeNull();
    expect(sourced(0, "x").value).toBe(0);
  });
});

describe("log redaction", () => {
  it("never leaks API keys or bot tokens", () => {
    const out = JSON.stringify(
      redact({
        url: "https://api.blockscout.com/4663/api/v2/tokens/x?apikey=SECRET123",
        auth: "Bearer abc.def-ghi",
        tg: "https://api.telegram.org/bot123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage",
        FOMO_API_KEY: "fomo-secret",
        alchemy: "https://robinhood-mainnet.g.alchemy.com/v2/abcdefghijklmnopqrstuvwxyz",
        token: T,
      }),
    );
    for (const secret of [
      "SECRET123",
      "abc.def-ghi",
      "AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw",
      "fomo-secret",
      "abcdefghijklmnopqrstuvwxyz",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain(T); // token addresses are not secrets
  });
});
