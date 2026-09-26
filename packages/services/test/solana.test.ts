import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { findPda } from "../src/scan/solana-creator";

describe("Solana PDA derivation", () => {
  it("derives the real pump.fun bonding curve of SPIKE (verified on-chain)", () => {
    const mint = "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump";
    const curve = findPda(
      [new TextEncoder().encode("bonding-curve"), base58.decode(mint)],
      "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    );
    expect(curve).toBe("FwLFTcgy3m1xWjgKShHFnxWBRYag5SSnApGkY8UZWrKf");
  });
});
