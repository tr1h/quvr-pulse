import { toFunctionSelector } from "viem";
import type { ContractCapability } from "@quvr/shared";

export type CapabilityId = ContractCapability["id"];

/**
 * Function signatures whose presence in the dispatcher indicates a capability.
 * Presence alone is NOT proof of risk: it is combined with ownership state and
 * read-only eth_call probes before a finding is raised (see contract.ts).
 */
export const CAPABILITY_SIGNATURES: Record<CapabilityId, string[]> = {
  mint: [
    "mint(address,uint256)",
    "mint(uint256)",
    "mintTo(address,uint256)",
    "issue(uint256)",
    "mint(address,uint256,bytes)",
  ],
  pause: ["pause()", "unpause()", "setPaused(bool)", "pauseTrading()"],
  blacklist: [
    "blacklist(address)",
    "blacklistAddress(address,bool)",
    "addToBlacklist(address)",
    "addBlacklist(address)",
    "setBlacklist(address,bool)",
    "setBlacklisted(address,bool)",
    "setBots(address[],bool)",
    "addBots(address[])",
    "setBot(address,bool)",
    "blockBots(address[])",
    "manageBlacklist(address[],bool)",
    "isBlacklisted(address)",
    "isBot(address)",
    "bots(address)",
  ],
  whitelist: [
    "setWhitelist(address,bool)",
    "addToWhitelist(address)",
    "setWhitelisted(address,bool)",
    "excludeFromFee(address)",
    "excludeFromFees(address,bool)",
    "setExcludedFromFee(address,bool)",
  ],
  "fee-change": [
    "setFee(uint256)",
    "setFees(uint256,uint256)",
    "setFee(uint256,uint256)",
    "setTaxFee(uint256)",
    "setBuyFee(uint256)",
    "setSellFee(uint256)",
    "setTaxes(uint256,uint256)",
    "setTax(uint256)",
    "updateFees(uint256,uint256)",
    "setBuyTax(uint256)",
    "setSellTax(uint256)",
    "updateBuyFees(uint256,uint256,uint256)",
    "updateSellFees(uint256,uint256,uint256)",
  ],
  "balance-modify": [
    "setBalance(address,uint256)",
    "setBalances(address[],uint256[])",
    "updateBalance(address,uint256)",
    "adminBurn(address,uint256)",
    "forceTransfer(address,address,uint256)",
    "adminTransfer(address,address,uint256)",
    "rebase(uint256,int256)",
    "rebase(uint256)",
  ],
  "transfer-restriction": [
    "freeze(address)",
    "freezeAccount(address,bool)",
    "lockAccount(address)",
    "setTransferable(bool)",
    "setCooldown(uint256)",
    "setTransferDelayEnabled(bool)",
  ],
  "max-wallet-tx": [
    "setMaxWalletSize(uint256)",
    "setMaxWallet(uint256)",
    "setMaxTxAmount(uint256)",
    "setMaxTransactionAmount(uint256)",
    "updateMaxTxnAmount(uint256)",
    "updateMaxWalletAmount(uint256)",
    "setMaxTxPercent(uint256)",
    "setMaxWalletPercent(uint256)",
    "removeLimits()",
  ],
  "trading-toggle": [
    "openTrading()",
    "enableTrading()",
    "startTrading()",
    "disableTrading()",
    "setTrading(bool)",
    "setTradingEnabled(bool)",
    "setTradingOpen(bool)",
  ],
  "router-pair-change": [
    "setRouter(address)",
    "setPair(address)",
    "updateRouter(address)",
    "setUniswapRouter(address)",
    "setAutomatedMarketMakerPair(address,bool)",
    "setUniswapV2Pair(address)",
    "updateUniswapV2Router(address)",
  ],
  ownership: [
    "owner()",
    "getOwner()",
    "transferOwnership(address)",
    "renounceOwnership()",
    "grantRole(bytes32,address)",
    "hasRole(bytes32,address)",
  ],
  upgrade: [
    "upgradeTo(address)",
    "upgradeToAndCall(address,bytes)",
    "changeAdmin(address)",
    "implementation()",
  ],
  delegatecall: [],
  selfdestruct: [],
};

/** Read-only getters used to report fee/limit values (never interpreted beyond display). */
export const FEE_GETTERS = [
  "buyFee()",
  "sellFee()",
  "buyTax()",
  "sellTax()",
  "totalFees()",
  "taxFee()",
  "_taxFee()",
  "buyTotalFees()",
  "sellTotalFees()",
  "maxWallet()",
  "maxWalletSize()",
  "_maxWalletSize()",
  "maxTransactionAmount()",
  "_maxTxAmount()",
  "tradingOpen()",
  "tradingEnabled()",
] as const;

const SELECTOR_INDEX: Map<string, { capability: CapabilityId; signature: string }> = new Map();
for (const [cap, sigs] of Object.entries(CAPABILITY_SIGNATURES) as Array<
  [CapabilityId, string[]]
>) {
  for (const sig of sigs)
    SELECTOR_INDEX.set(toFunctionSelector(`function ${sig}`).toLowerCase(), {
      capability: cap,
      signature: sig,
    });
}
export const FEE_GETTER_SELECTORS = new Map(
  FEE_GETTERS.map((sig) => [toFunctionSelector(`function ${sig}`).toLowerCase(), sig]),
);

export function selectorOf(signature: string): string {
  return toFunctionSelector(`function ${signature}`).toLowerCase();
}

export type BytecodeReport = {
  size: number;
  selectors: string[];
  hasDelegatecall: boolean;
  hasSelfdestruct: boolean;
  hasCallcode: boolean;
  minimalProxyTarget: string | null;
  capabilityHits: Array<{ capability: CapabilityId; signature: string; selector: string }>;
  feeGetters: Array<{ signature: string; selector: string }>;
};

const EIP1167 = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i;

/** Removes the Solidity/Vyper CBOR metadata trailer so it is not parsed as opcodes. */
export function stripMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4) return bytes;
  const len = (bytes[bytes.length - 2]! << 8) | bytes[bytes.length - 1]!;
  const start = bytes.length - 2 - len;
  if (len > 0 && start > 0) {
    const first = bytes[start]!;
    if (first >= 0xa1 && first <= 0xa5) return bytes.subarray(0, start);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function analyzeBytecode(code: string): BytecodeReport {
  const lower = code.toLowerCase();
  const proxy = EIP1167.exec(lower);
  const all = hexToBytes(lower);
  const bytes = stripMetadata(all);
  const selectors = new Set<string>();
  let hasDelegatecall = false;
  let hasSelfdestruct = false;
  let hasCallcode = false;

  // Linear sweep honoring PUSH immediates, so data bytes are never treated as opcodes.
  const ops: Array<{ op: number; imm?: string }> = [];
  for (let i = 0; i < bytes.length; i++) {
    const op = bytes[i]!;
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f;
      const imm = Array.from(bytes.subarray(i + 1, i + 1 + n), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      ops.push({ op, imm });
      i += n;
      continue;
    }
    ops.push({ op });
    if (op === 0xf4) hasDelegatecall = true;
    else if (op === 0xff) hasSelfdestruct = true;
    else if (op === 0xf2) hasCallcode = true;
  }
  // Dispatcher pattern: PUSH4 <selector> followed (within 2 ops) by EQ.
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]!;
    if (o.op !== 0x63 || !o.imm) continue;
    if (ops[i + 1]?.op === 0x14 || ops[i + 2]?.op === 0x14) selectors.add(`0x${o.imm}`);
  }

  const capabilityHits: BytecodeReport["capabilityHits"] = [];
  const feeGetters: BytecodeReport["feeGetters"] = [];
  for (const sel of selectors) {
    const hit = SELECTOR_INDEX.get(sel);
    if (hit) capabilityHits.push({ ...hit, selector: sel });
    const fee = FEE_GETTER_SELECTORS.get(sel);
    if (fee) feeGetters.push({ signature: fee, selector: sel });
  }

  return {
    size: all.length,
    selectors: [...selectors],
    hasDelegatecall,
    hasSelfdestruct,
    hasCallcode,
    minimalProxyTarget: proxy ? `0x${proxy[1]}` : null,
    capabilityHits,
    feeGetters,
  };
}

/** Normalizes runtime bytecode for source comparison: strips metadata trailer. */
export function comparableBytecode(code: string): string {
  const bytes = stripMetadata(hexToBytes(code.toLowerCase()));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Source-level confirmation patterns (used only when verified source is available). */
export const SOURCE_PATTERNS: Partial<Record<CapabilityId, RegExp>> = {
  mint: /function\s+mint\w*\s*\(/i,
  blacklist: /(blacklist|isBot|bots\s*\[|_isBlacklisted)/i,
  "fee-change": /function\s+set\w*(fee|tax)\w*\s*\(/i,
  "balance-modify": /_balances\s*\[[^\]]+\]\s*=\s*(?!_balances)/i,
  "trading-toggle": /(tradingOpen|tradingEnabled|tradingActive)\s*=/i,
  pause: /whenNotPaused|_pause\s*\(/i,
  "max-wallet-tx": /(maxWallet|maxTx|maxTransaction)/i,
};
