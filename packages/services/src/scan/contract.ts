import { encodeFunctionData, keccak256, parseAbi, type Hex } from "viem";
import {
  decodeAddress,
  decodeUint,
  type ChainProvider,
  type ExplorerContractSource,
} from "@quvr/providers";
import {
  analyzeBytecode,
  CAPABILITY_SIGNATURES,
  comparableBytecode,
  selectorOf,
  SOURCE_PATTERNS,
  type BytecodeReport,
  type CapabilityId,
} from "@quvr/scoring";
import { isDelegatedEoaCode, type ContractAnalysis, type ContractCapability } from "@quvr/shared";

const EIP1967_IMPL = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_ADMIN = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const EIP1967_BEACON = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

/** Arbitrary never-used addresses for read-only probes (no keys exist for them). */
export const PROBE_CALLER = "0x00000000000000000000000000000000000c0de1";
export const PROBE_TARGET = "0x00000000000000000000000000000000000c0de2";

const OWNER_ABI = parseAbi([
  "function owner() view returns (address)",
  "function getOwner() view returns (address)",
  "function getMinDelay() view returns (uint256)",
  "function getThreshold() view returns (uint256)",
]);

/** Probes: calldata for capability functions with harmless-looking arguments. eth_call only. */
const PROBES: Array<{ capability: CapabilityId; signature: string; data: () => Hex }> = [
  {
    capability: "mint",
    signature: "mint(address,uint256)",
    data: () => enc("function mint(address,uint256)", [PROBE_TARGET, 1n]),
  },
  {
    capability: "mint",
    signature: "mint(uint256)",
    data: () => enc("function mint(uint256)", [1n]),
  },
  {
    capability: "mint",
    signature: "mintTo(address,uint256)",
    data: () => enc("function mintTo(address,uint256)", [PROBE_TARGET, 1n]),
  },
  { capability: "pause", signature: "pause()", data: () => enc("function pause()", []) },
  {
    capability: "blacklist",
    signature: "blacklist(address)",
    data: () => enc("function blacklist(address)", [PROBE_TARGET]),
  },
  {
    capability: "blacklist",
    signature: "addToBlacklist(address)",
    data: () => enc("function addToBlacklist(address)", [PROBE_TARGET]),
  },
  {
    capability: "blacklist",
    signature: "setBlacklist(address,bool)",
    data: () => enc("function setBlacklist(address,bool)", [PROBE_TARGET, true]),
  },
  {
    capability: "blacklist",
    signature: "setBot(address,bool)",
    data: () => enc("function setBot(address,bool)", [PROBE_TARGET, true]),
  },
  {
    capability: "blacklist",
    signature: "setBots(address[],bool)",
    data: () => enc("function setBots(address[],bool)", [[PROBE_TARGET], true]),
  },
  {
    capability: "balance-modify",
    signature: "setBalance(address,uint256)",
    data: () => enc("function setBalance(address,uint256)", [PROBE_TARGET, 1n]),
  },
  {
    capability: "trading-toggle",
    signature: "setTradingEnabled(bool)",
    data: () => enc("function setTradingEnabled(bool)", [false]),
  },
  {
    capability: "trading-toggle",
    signature: "setTrading(bool)",
    data: () => enc("function setTrading(bool)", [false]),
  },
  {
    capability: "trading-toggle",
    signature: "disableTrading()",
    data: () => enc("function disableTrading()", []),
  },
];

function enc(sig: string, args: unknown[]): Hex {
  const abi = parseAbi([sig]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return encodeFunctionData({ abi, args } as any);
}

const slotToAddress = (v: Hex | null | undefined) => {
  if (!v || /^0x0*$/.test(v)) return null;
  return `0x${v.slice(-40)}`.toLowerCase();
};

/** Bytecode analysis runs once per code hash (per process); ownership/probes run every scan. */
const BYTECODE_CACHE = new Map<string, BytecodeReport>();
function analyzeBytecodeCached(code: Hex): BytecodeReport {
  const h = keccak256(code);
  let r = BYTECODE_CACHE.get(h);
  if (!r) {
    r = analyzeBytecode(code);
    if (BYTECODE_CACHE.size > 2_000) BYTECODE_CACHE.clear();
    BYTECODE_CACHE.set(h, r);
  }
  return r;
}

export type ContractAnalysisResult = {
  analysis: ContractAnalysis;
  codeHash: string | null;
  report: BytecodeReport | null;
};

export async function analyzeContract(
  chain: ChainProvider,
  token: string,
  code: Hex,
  source: ExplorerContractSource | null,
): Promise<ContractAnalysisResult> {
  if (!code || code === "0x") {
    return {
      codeHash: null,
      report: null,
      analysis: {
        isContract: false,
        codeHash: null,
        bytecodeSize: 0,
        verified: null,
        contractName: null,
        compiler: null,
        proxy: { isProxy: false, kind: null, implementation: null, admin: null },
        owner: {
          address: null,
          kind: "none",
          isTimelock: null,
          timelockDelaySec: null,
          isMultisig: null,
        },
        capabilities: [],
        feeReadings: [],
        bytecodeMatchesSource: null,
        selectorsFound: 0,
      },
    };
  }

  const codeHash = keccak256(code);
  let report = analyzeBytecodeCached(code);

  // ---- proxy detection (EIP-1167, EIP-1967 implementation/admin/beacon slots)
  const [implSlot, adminSlot, beaconSlot] = await Promise.all([
    chain.getStorageAt(token, EIP1967_IMPL).catch(() => null),
    chain.getStorageAt(token, EIP1967_ADMIN).catch(() => null),
    chain.getStorageAt(token, EIP1967_BEACON).catch(() => null),
  ]);
  let proxyKind: ContractAnalysis["proxy"]["kind"] = null;
  let implementation = slotToAddress(implSlot);
  if (report.minimalProxyTarget) {
    proxyKind = "eip1167";
    implementation = report.minimalProxyTarget;
  } else if (implementation) proxyKind = "eip1967";
  else if (slotToAddress(beaconSlot)) proxyKind = "beacon";
  else if (source?.implementations.length) {
    proxyKind = "explorer";
    implementation = source.implementations[0] ?? null;
  }
  // Analyze the logic contract's bytecode for capabilities when proxied.
  if (implementation) {
    const implCode = await chain.getCode(implementation).catch(() => "0x" as Hex);
    if (implCode !== "0x") {
      const implReport = analyzeBytecodeCached(implCode);
      report = {
        ...implReport,
        capabilityHits: [...implReport.capabilityHits, ...report.capabilityHits],
        hasDelegatecall: report.hasDelegatecall || implReport.hasDelegatecall,
      };
    }
  }
  const admin = slotToAddress(adminSlot);

  // ---- ownership
  const hasOwnerFn = report.capabilityHits.some(
    (h) => h.signature === "owner()" || h.signature === "getOwner()",
  );
  let ownerAddr: string | null = null;
  if (hasOwnerFn) {
    const [o1, o2] = await chain.callMany([
      { to: token, data: encodeFunctionData({ abi: OWNER_ABI, functionName: "owner" }) },
      { to: token, data: encodeFunctionData({ abi: OWNER_ABI, functionName: "getOwner" }) },
    ]);
    ownerAddr =
      (o1?.ok ? decodeAddress(o1.data) : null) ?? (o2?.ok ? decodeAddress(o2.data) : null);
  }
  const privileged = admin ?? ownerAddr;
  let owner: ContractAnalysis["owner"] = {
    address: ownerAddr,
    kind: "unknown",
    isTimelock: null,
    timelockDelaySec: null,
    isMultisig: null,
  };
  if (!hasOwnerFn && !report.capabilityHits.some((h) => h.capability === "ownership"))
    owner.kind = "none";
  else if (!hasOwnerFn)
    owner.kind = "unknown"; // role-based access (grantRole/hasRole) — not resolved
  else if (
    !ownerAddr ||
    /^0x0{40}$/.test(ownerAddr) ||
    ownerAddr === "0x000000000000000000000000000000000000dead"
  )
    owner.kind = "renounced";
  else {
    const oc = await chain.getCode(ownerAddr).catch(() => null);
    if (oc === "0x" || isDelegatedEoaCode(oc)) owner.kind = "eoa";
    else if (oc) {
      owner.kind = "contract";
      const [delay, threshold] = await chain.callMany([
        {
          to: ownerAddr,
          data: encodeFunctionData({ abi: OWNER_ABI, functionName: "getMinDelay" }),
        },
        {
          to: ownerAddr,
          data: encodeFunctionData({ abi: OWNER_ABI, functionName: "getThreshold" }),
        },
      ]);
      const d = delay?.ok ? decodeUint(delay.data) : null;
      const th = threshold?.ok ? decodeUint(threshold.data) : null;
      owner = {
        ...owner,
        isTimelock: d !== null,
        timelockDelaySec: d !== null ? Number(d) : null,
        isMultisig: th !== null && th > 1n,
      };
    }
  }

  // ---- capabilities (bytecode) + source confirmation
  const byCap = new Map<CapabilityId, ContractCapability>();
  const ensure = (id: CapabilityId) => {
    let c = byCap.get(id);
    if (!c) {
      c = { id, present: false, evidence: [], probed: "not-probed", gated: "unknown" };
      byCap.set(id, c);
    }
    return c;
  };
  for (const hit of report.capabilityHits) {
    const c = ensure(hit.capability);
    c.present = true;
    c.evidence.push(`bytecode: selector ${hit.selector} ${hit.signature}`);
  }
  if (report.hasDelegatecall) {
    const c = ensure("delegatecall");
    c.present = true;
    c.evidence.push("bytecode: DELEGATECALL (0xf4) opcode");
  }
  if (report.hasSelfdestruct) {
    const c = ensure("selfdestruct");
    c.present = true;
    c.evidence.push("bytecode: SELFDESTRUCT (0xff) opcode");
  }
  if (proxyKind === "eip1167") {
    // Minimal proxy clone: the logic address is part of the clone's own bytecode, so it can
    // never change. Upgrade selectors inside the shared template (e.g. UUPS) write an ERC-1967
    // slot the clone never reads, and DELEGATECALL is simply how every clone works.
    for (const id of ["upgrade", "delegatecall"] as const) {
      const c = byCap.get(id);
      if (c) {
        c.present = false;
        c.evidence.push("eip1167 clone: logic address fixed in bytecode, not upgradeable");
      }
    }
  } else if (proxyKind) {
    const c = ensure("upgrade");
    c.present = true;
    c.evidence.push(`proxy: ${proxyKind}${implementation ? ` → ${implementation}` : ""}`);
  }
  if (source?.sourceCode) {
    for (const [cap, re] of Object.entries(SOURCE_PATTERNS) as Array<[CapabilityId, RegExp]>) {
      if (re.test(source.sourceCode)) {
        const c = ensure(cap);
        c.evidence.push(`source: pattern ${re.source.slice(0, 40)}`);
        // Source-only matches (e.g. internal functions) are recorded as evidence but do not
        // flip `present` — exposure is established from the dispatcher.
      }
    }
  }

  // ---- read-only probes: from a random caller, then from the privileged account
  const probes = PROBES.filter((p) =>
    report.capabilityHits.some((h) => h.selector === selectorOf(p.signature)),
  );
  if (probes.length) {
    const calls = probes.flatMap((p) => [
      { to: token, data: p.data(), from: PROBE_CALLER },
      ...(privileged && owner.kind !== "renounced"
        ? [{ to: token, data: p.data(), from: privileged }]
        : []),
    ]);
    const res = await chain.callMany(calls).catch(() => null);
    if (res) {
      let i = 0;
      for (const p of probes) {
        const c = ensure(p.capability);
        const anyone = res[i++];
        const byOwner = privileged && owner.kind !== "renounced" ? res[i++] : undefined;
        if (anyone?.ok) {
          c.gated = "anyone";
          c.probed = "succeeded";
          c.evidence.push(`eth_call ${p.signature} from random address succeeded`);
        } else if (byOwner?.ok) {
          if (c.gated !== "anyone") c.gated = "owner";
          c.probed = "succeeded";
          c.evidence.push(`eth_call ${p.signature} from owner ${privileged} succeeded`);
        } else if (byOwner && c.probed === "not-probed") {
          c.probed = "reverted";
          c.evidence.push(`eth_call ${p.signature} from owner reverted`);
        }
      }
    }
  }
  for (const c of byCap.values()) {
    if (c.gated === "unknown" && owner.kind === "renounced") c.gated = "renounced";
    else if (c.gated === "unknown" && (owner.kind === "eoa" || owner.kind === "contract"))
      c.gated = "owner";
  }

  // ---- fee/limit getters (displayed raw; never interpreted as percentages)
  const feeReadings: ContractAnalysis["feeReadings"] = [];
  if (report.feeGetters.length) {
    const res = await chain
      .callMany(report.feeGetters.map((g) => ({ to: token, data: g.selector as Hex })))
      .catch(() => []);
    report.feeGetters.forEach((g, i) => {
      const r = res[i];
      const v = r?.ok ? decodeUint(r.data) : null;
      if (v !== null) feeReadings.push({ fn: g.signature, value: v.toString() });
    });
  }

  const bytecodeMatchesSource =
    source?.verified && source.deployedBytecode && source.deployedBytecode.length > 2
      ? comparableBytecode(source.deployedBytecode) === comparableBytecode(code)
      : null;

  const allIds = Object.keys(CAPABILITY_SIGNATURES) as CapabilityId[];
  return {
    codeHash,
    report,
    analysis: {
      isContract: true,
      codeHash,
      bytecodeSize: report.size,
      verified: source ? source.verified : null,
      contractName: source?.name ?? null,
      compiler: source?.compiler ?? null,
      proxy: { isProxy: !!proxyKind, kind: proxyKind, implementation, admin },
      owner,
      capabilities: allIds.map(
        (id) =>
          byCap.get(id) ?? {
            id,
            present: false,
            evidence: [],
            probed: "not-probed",
            gated: "unknown",
          },
      ),
      feeReadings,
      bytecodeMatchesSource,
      selectorsFound: report.selectors.length,
    },
  };
}
