import { describe, expect, it } from "vitest";
import { contractFindings, contractSafetyScore } from "../src/contract";
import { analysis, failedSim, passedSim, unavailableSim } from "./fixtures";

const NOW = new Date("2026-09-23T12:00:00Z");

describe("contractSafetyScore", () => {
  it("gives 100 to a verified, renounced, privilege-free token that passes simulation", () => {
    const s = contractSafetyScore({ analysis: analysis(), simulation: passedSim, now: NOW });
    expect(s.value).toBe(100);
    expect(s.level).toBe("low");
    expect(s.confidence).toBe("high");
    expect(s.coverage).toBe(1);
    expect(s.updatedAt).toBe(NOW.toISOString());
  });

  it("never reports a number without analysis (insufficient data, not zero)", () => {
    const s = contractSafetyScore({ analysis: null, simulation: null, now: NOW });
    expect(s.value).toBeNull();
    expect(s.level).toBe("insufficient");
  });

  it("returns insufficient data for non-contract addresses", () => {
    const s = contractSafetyScore({
      analysis: analysis({ isContract: false }),
      simulation: null,
      now: NOW,
    });
    expect(s.value).toBeNull();
    expect(s.reasons[0]?.impact).toBe("negative");
  });

  it("caps the score when the sell simulation fails (honeypot signal)", () => {
    const s = contractSafetyScore({ analysis: analysis(), simulation: failedSim, now: NOW });
    expect(s.value).toBeLessThanOrEqual(20);
    expect(s.level).toBe("high");
  });

  it("excludes an unavailable simulation from the total and lowers coverage", () => {
    const s = contractSafetyScore({ analysis: analysis(), simulation: unavailableSim, now: NOW });
    const sim = s.components.find((c) => c.id === "simulation");
    expect(sim?.points).toBeNull();
    expect(s.coverage).toBe(0.8);
    expect(s.value).toBe(100);
  });

  it("penalizes owner-controlled mint + EOA owner heavily", () => {
    const s = contractSafetyScore({
      analysis: analysis(
        {
          owner: {
            address: "0x1111111111111111111111111111111111111111",
            kind: "eoa",
            isTimelock: null,
            timelockDelaySec: null,
            isMultisig: null,
          },
        },
        [
          { id: "mint", gated: "owner", probed: "succeeded" },
          { id: "blacklist", gated: "owner" },
        ],
      ),
      simulation: passedSim,
      now: NOW,
    });
    const priv = s.components.find((c) => c.id === "privileges")!;
    const own = s.components.find((c) => c.id === "ownership")!;
    expect(priv.points).toBe(8); // 30 - 12 - 10
    expect(own.points).toBe(0);
    expect(s.value).toBeLessThan(75);
    expect(s.level).not.toBe("low");
  });

  it("treats renounced privileges as mostly inert but not free", () => {
    const withRenounced = contractSafetyScore({
      analysis: analysis({}, [{ id: "mint", gated: "renounced" }]),
      simulation: passedSim,
      now: NOW,
    });
    const priv = withRenounced.components.find((c) => c.id === "privileges")!;
    expect(priv.points).toBe(27); // 30 - 12 * 0.25
  });

  it("a mint callable by anyone wipes the privileges budget", () => {
    const s = contractSafetyScore({
      analysis: analysis({}, [{ id: "mint", gated: "anyone", probed: "succeeded" }]),
      simulation: passedSim,
      now: NOW,
    });
    expect(s.components.find((c) => c.id === "privileges")!.points).toBe(0);
  });

  it("scores upgradeable proxies without timelock at 0 for upgrade risk", () => {
    const s = contractSafetyScore({
      analysis: analysis({
        proxy: {
          isProxy: true,
          kind: "eip1967",
          implementation: "0x2222222222222222222222222222222222222222",
          admin: null,
        },
      }),
      simulation: passedSim,
      now: NOW,
    });
    expect(s.components.find((c) => c.id === "upgrade")!.points).toBe(0);
  });

  it("returns 3–5 reasons at most", () => {
    const s = contractSafetyScore({
      analysis: analysis({ verified: false }, [{ id: "mint" }, { id: "pause" }]),
      simulation: passedSim,
      now: NOW,
    });
    expect(s.reasons.length).toBeGreaterThanOrEqual(3);
    expect(s.reasons.length).toBeLessThanOrEqual(5);
  });
});

describe("contractFindings", () => {
  it("every finding carries severity, bilingual text, evidence, source and confidence", () => {
    const f = contractFindings(
      analysis({ verified: false }, [{ id: "mint", gated: "anyone", probed: "succeeded" }]),
      failedSim,
      "rpc",
    );
    expect(f.length).toBeGreaterThanOrEqual(3);
    for (const x of f) {
      expect(["info", "low", "medium", "high", "critical"]).toContain(x.severity);
      expect(x.title.ru && x.title.en).toBeTruthy();
      expect(x.explanation.ru && x.explanation.en).toBeTruthy();
      expect(x.source).toBeTruthy();
      expect(["low", "medium", "high"]).toContain(x.confidence);
      expect(Array.isArray(x.evidence)).toBe(true);
    }
    expect(f.find((x) => x.code === "contract.mint.anyone")?.severity).toBe("critical");
    expect(f.find((x) => x.code === "contract.sell-simulation-failed")?.severity).toBe("critical");
  });

  it("does not flag the ownership getter itself", () => {
    const f = contractFindings(analysis({}, [{ id: "ownership" }]), passedSim, "rpc");
    expect(f.some((x) => x.code === "contract.ownership")).toBe(false);
  });
});

describe("EIP-1167 clones (launchpad tokens)", () => {
  const clone = analysis({
    proxy: { isProxy: true, kind: "eip1167", implementation: "0x7777", admin: null },
  });
  const upgradeable = analysis({
    proxy: { isProxy: true, kind: "eip1967", implementation: "0x7777", admin: "0xadmin" },
    owner: {
      address: "0xadmin",
      kind: "eoa",
      isTimelock: false,
      timelockDelaySec: null,
      isMultisig: false,
    },
  });

  it("are not treated as upgradeable proxies", () => {
    const s = contractSafetyScore({ analysis: clone, simulation: passedSim, now: NOW });
    expect(s.value).toBe(100);
    expect(s.reasons.some((r) => /upgradeable/i.test(r.text.en))).toBe(false);
    const f = contractFindings(clone, passedSim, "rpc");
    expect(f.find((x) => x.code === "contract.proxy")).toBeUndefined();
    expect(f.find((x) => x.code === "contract.clone")?.severity).toBe("info");
  });

  it("while a real ERC-1967 proxy with an EOA admin still counts as upgrade risk", () => {
    const s = contractSafetyScore({ analysis: upgradeable, simulation: passedSim, now: NOW });
    expect(s.value).toBeLessThan(100);
    expect(
      contractFindings(upgradeable, passedSim, "rpc").find((x) => x.code === "contract.proxy")
        ?.severity,
    ).toBe("medium");
  });
});
