import { describe, expect, it } from "vitest";
import { contractSafetyScore } from "../src/contract";
import { analyzeSolanaMint, type SolanaMintInput } from "../src/solana";

const base: SolanaMintInput = {
  program: "spl-token",
  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  mintAuthority: null,
  freezeAuthority: null,
  extensions: [],
};
const wallet = () => true;
const NOW = new Date("2026-09-23T00:00:00Z");

describe("analyzeSolanaMint", () => {
  it("revoked authorities (like SPIKE) → renounced, no dangerous capabilities", () => {
    const { analysis, findings } = analyzeSolanaMint(base, wallet);
    expect(analysis.owner.kind).toBe("renounced");
    expect(analysis.verified).toBe(true);
    expect(analysis.capabilities).toHaveLength(0);
    expect(findings.map((f) => f.code)).toEqual(["solana.authorities-revoked"]);
    const s = contractSafetyScore({ analysis, simulation: null, now: NOW });
    expect(s.value).toBe(100);
    expect(s.coverage).toBe(0.8); // simulation unavailable on Solana
  });

  it("live mint + freeze authority held by a wallet → high risk", () => {
    const { analysis, findings } = analyzeSolanaMint(
      { ...base, mintAuthority: "Auth111", freezeAuthority: "Auth111" },
      wallet,
    );
    expect(analysis.owner.kind).toBe("eoa");
    expect(findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["solana.mint-authority", "solana.freeze-authority"]),
    );
    const s = contractSafetyScore({ analysis, simulation: null, now: NOW });
    expect(s.value!).toBeLessThan(50);
    expect(s.level).toBe("high");
  });

  it("Token-2022 permanent delegate and non-transferable are critical", () => {
    const { findings } = analyzeSolanaMint(
      {
        ...base,
        program: "spl-token-2022",
        extensions: [
          { extension: "permanentDelegate", state: { delegate: "Del111" } },
          { extension: "nonTransferable", state: {} },
        ],
      },
      wallet,
    );
    expect(
      findings
        .filter((f) => f.severity === "critical")
        .map((f) => f.code)
        .sort(),
    ).toEqual(["solana.non-transferable", "solana.permanent-delegate"]);
  });

  it("reads the transfer fee and flags a changeable fee", () => {
    const { analysis, findings } = analyzeSolanaMint(
      {
        ...base,
        program: "spl-token-2022",
        extensions: [
          {
            extension: "transferFeeConfig",
            state: {
              transferFeeConfigAuthority: "FeeAuth",
              newerTransferFee: { transferFeeBasisPoints: 500, maximumFee: 1000 },
            },
          },
        ],
      },
      () => false,
    );
    expect(analysis.feeReadings[0]).toEqual({ fn: "transferFeeBasisPoints", value: "500" });
    expect(findings.find((f) => f.code === "solana.transfer-fee")?.severity).toBe("medium");
    // Every finding must carry bilingual explanations for the UI.
    for (const f of findings) expect(f.explanation.ru && f.explanation.en).toBeTruthy();
    expect(findings.some((f) => f.code === "solana.fee-authority")).toBe(true);
    expect(analysis.owner.kind).toBe("contract");
  });

  it("non-standard token program is flagged and not treated as verified", () => {
    const { analysis, findings } = analyzeSolanaMint(
      { ...base, program: "other", programId: "X" },
      wallet,
    );
    expect(analysis.verified).toBeNull();
    expect(findings[0]!.code).toBe("solana.unknown-program");
  });
});
