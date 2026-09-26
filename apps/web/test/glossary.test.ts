import { describe, expect, it } from "vitest";
import { TERMS, termForCode, type T5 } from "../src/lib/glossary";

const LANGS = ["ru", "en", "de", "es", "zh"] as const;

function allTexts(): T5[] {
  return TERMS.flatMap((t) => [
    t.title,
    t.description,
    t.h1,
    t.short,
    t.check,
    ...t.sections.flatMap((s) => [s.h, s.p]),
    ...t.faq.flatMap((f) => [f.q, f.a]),
  ]);
}

describe("learn glossary", () => {
  it("has every text in all five languages", () => {
    for (const text of allTexts())
      for (const l of LANGS) expect(text[l].trim().length).toBeGreaterThan(0);
  });

  it("uses unique slugs", () => {
    expect(new Set(TERMS.map((t) => t.slug)).size).toBe(TERMS.length);
  });

  it("links report findings to the right explainer", () => {
    expect(termForCode("solana.mint-authority")?.slug).toBe("mint-authority");
    expect(termForCode("contract.mint.anyone")?.slug).toBe("mint-authority");
    expect(termForCode("solana.freeze-authority")?.slug).toBe("freeze-authority");
    expect(termForCode("distribution.cluster.c3")?.slug).toBe("possibly-related-wallets");
    expect(termForCode("liquidity.impact")?.slug).toBe("price-impact");
    expect(termForCode("distribution.concentrated")?.slug).toBe("holder-concentration");
    expect(termForCode("data.explorer-unavailable")).toBeUndefined();
  });

  it("never calls anything safe (only quotes the word to explain why we avoid it)", () => {
    for (const text of allTexts()) expect(text.en).not.toMatch(/(?<!“)\bsafe\b(?!”)/i);
  });
});
