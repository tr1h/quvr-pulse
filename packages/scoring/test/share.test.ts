import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TokenReport } from "@quvr/shared";
import { shareFacts, shareText, X_LIMIT, xLength } from "../src/share";

// Real production report of a fresh pump.fun token (public on-chain data).
const rocco = JSON.parse(
  readFileSync(new URL("./fixtures-rocco.json", import.meta.url), "utf8"),
) as TokenReport;
const URL_ = "https://quvrpulse.com/token/9Jfxfiw84f2jBpLqACHchd727LLLHgJa6uhSmnrbpump";

describe("share text for X", () => {
  it("puts the key facts of a real report first", () => {
    const facts = shareFacts(rocco);
    expect(facts[0]).toBe("mint & freeze revoked");
    expect(facts).toContain("creator holds 27% of supply");
    expect(facts.some((f) => f.startsWith("top-10 hold 97%"))).toBe(true);
  });

  it("fits into one post and keeps the link, verdict and NFA", () => {
    const text = shareText(rocco, URL_);
    expect(xLength(text, URL_)).toBeLessThanOrEqual(X_LIMIT);
    expect(text).toMatch(/^\$ROCCO on @quvrpulse:/);
    expect(text).toContain("Verdict: High risk");
    expect(text).toContain(URL_);
    expect(text.endsWith("NFA")).toBe(true);
  });

  it("never uses forbidden wording", () => {
    const text = shareText(rocco, URL_).toLowerCase();
    expect(text).not.toMatch(/\bsafe\b|\bscam\b|\bbuy now\b|\brug\b|100x/);
  });

  it("drops lower-priority facts instead of exceeding the limit", () => {
    const noisy = structuredClone(rocco);
    noisy.token.symbol = { ...noisy.token.symbol, value: "A".repeat(60) };
    const text = shareText(noisy, URL_);
    expect(xLength(text, URL_)).toBeLessThanOrEqual(X_LIMIT);
    expect(text).toContain("Verdict:");
  });
});
