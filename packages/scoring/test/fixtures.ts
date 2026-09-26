import type { ContractAnalysis, ContractCapability, SimulationResult } from "@quvr/shared";

type CapId = ContractCapability["id"];

export function analysis(
  overrides: Partial<ContractAnalysis> = {},
  caps: Array<Partial<ContractCapability> & { id: CapId }> = [],
): ContractAnalysis {
  return {
    isContract: true,
    codeHash: "0xabc",
    bytecodeSize: 3000,
    verified: true,
    contractName: "Token",
    compiler: "v0.8.26",
    proxy: { isProxy: false, kind: null, implementation: null, admin: null },
    owner: {
      address: null,
      kind: "renounced",
      isTimelock: null,
      timelockDelaySec: null,
      isMultisig: null,
    },
    capabilities: caps.map((c) => ({
      present: true,
      evidence: ["bytecode: test"],
      probed: "not-probed",
      gated: "unknown",
      ...c,
    })),
    feeReadings: [],
    bytecodeMatchesSource: true,
    selectorsFound: 12,
    ...overrides,
  };
}

export const passedSim: SimulationResult = {
  status: "passed",
  method: "test",
  buy: { ok: true, detail: "ok" },
  sell: { ok: true, detail: "ok" },
  blockNumber: 1,
  notes: { ru: "", en: "" },
};

export const failedSim: SimulationResult = {
  ...passedSim,
  status: "failed",
  sell: { ok: false, detail: "reverted" },
};
export const unavailableSim: SimulationResult = {
  ...passedSim,
  status: "unavailable",
  buy: null,
  sell: null,
};
