import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TokenReport } from "@quvr/shared";
import { extractTokenRef, formatQuickCard } from "../src/card";

const rocco = JSON.parse(
  readFileSync(
    new URL("../../../packages/scoring/test/fixtures-rocco.json", import.meta.url),
    "utf8",
  ),
) as TokenReport;

describe("extractTokenRef", () => {
  it("finds a CA inside a normal chat message", () => {
    expect(
      extractTokenRef(
        "$Protocol up 3x 🚀\n\n0xa67A3EebF0AE8A935848bB47993b9A6d68751A23 link in bio",
      ),
    ).toEqual({ chain: "robinhood", address: "0xa67a3eebf0ae8a935848bb47993b9a6d68751a23" });
    expect(
      extractTokenRef("CA: 9Jfxfiw84f2jBpLqACHchd727LLLHgJa6uhSmnrbpump stick to this one"),
    ).toEqual({
      chain: "solana",
      address: "9Jfxfiw84f2jBpLqACHchd727LLLHgJa6uhSmnrbpump",
    });
  });

  it("ignores ordinary text and too-short hex", () => {
    expect(extractTokenRef("gm, what are we buying today?")).toBeNull();
    expect(extractTokenRef("tx 0x1234 failed")).toBeNull();
  });
});

describe("formatQuickCard", () => {
  it("shows verdict, key facts, clones warning and the report link", () => {
    const card = formatQuickCard(
      rocco,
      {
        ticker: "ROCCO",
        total: 5,
        rank: 3,
        state: "smaller",
        largest: null,
        others: [],
      },
      "https://quvrpulse.com",
    );
    expect(card).toContain("<b>$ROCCO</b>");
    expect(card).toContain("🔴 High risk");
    expect(card).toContain("creator holds 27% of supply");
    expect(card).toContain("5 tokens use this ticker — this one is #3");
    expect(card).toContain(
      'href="https://quvrpulse.com/token/9Jfxfiw84f2jBpLqACHchd727LLLHgJa6uhSmnrbpump"',
    );
    expect(card.toLowerCase()).not.toMatch(/\bsafe\b|\bscam\b/);
  });

  it("escapes attacker-controlled token names", () => {
    const evil = structuredClone(rocco);
    evil.token.name = { ...evil.token.name, value: '<a href="x">claim</a>' };
    const card = formatQuickCard(evil, null, "https://quvrpulse.com");
    expect(card).not.toContain('<a href="x">');
    expect(card).toContain("&lt;a href=");
  });
});
