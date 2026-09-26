import { describe, expect, it } from "vitest";
import { analyzeBytecode, selectorOf, stripMetadata } from "../src/bytecode";

/** Builds a toy dispatcher: DUP1 PUSH4 <sel> EQ PUSH2 0x0000 JUMPI for each selector. */
function dispatcher(selectors: string[], tail = ""): string {
  const body = selectors.map((s) => `8063${s.slice(2)}14610000` + "57").join("");
  return `0x6080604052${body}${tail}00`;
}

describe("analyzeBytecode", () => {
  it("extracts dispatcher selectors and maps capabilities", () => {
    const mint = selectorOf("mint(address,uint256)");
    const owner = selectorOf("owner()");
    const r = analyzeBytecode(dispatcher([mint, owner, "0x70a08231"]));
    expect(r.selectors).toEqual(expect.arrayContaining([mint, owner, "0x70a08231"]));
    expect(r.capabilityHits.map((h) => h.capability)).toEqual(
      expect.arrayContaining(["mint", "ownership"]),
    );
  });

  it("does not treat PUSH data as opcodes (0xff inside PUSH32 is not SELFDESTRUCT)", () => {
    const code = `0x7f${"ff".repeat(32)}00`;
    const r = analyzeBytecode(code);
    expect(r.hasSelfdestruct).toBe(false);
    expect(analyzeBytecode("0x6000ff").hasSelfdestruct).toBe(true);
    expect(analyzeBytecode("0x6000f4").hasDelegatecall).toBe(true);
  });

  it("detects EIP-1167 minimal proxies", () => {
    const target = "bebebebebebebebebebebebebebebebebebebebe";
    const r = analyzeBytecode(`0x363d3d373d3d3d363d73${target}5af43d82803e903d91602b57fd5bf3`);
    expect(r.minimalProxyTarget).toBe(`0x${target}`);
  });

  it("strips the CBOR metadata trailer", () => {
    // a2 64 ... (5 bytes of metadata) + length 0x0005
    const bytes = Uint8Array.from([0x60, 0x00, 0xa2, 0x64, 0x69, 0x70, 0x66, 0x00, 0x05]);
    expect(Array.from(stripMetadata(bytes))).toEqual([0x60, 0x00]);
  });

  it("does not report capabilities for selectors not followed by EQ", () => {
    const mint = selectorOf("mint(address,uint256)");
    const r = analyzeBytecode(`0x63${mint.slice(2)}50600000`); // PUSH4 then POP
    expect(r.capabilityHits).toHaveLength(0);
  });
});
