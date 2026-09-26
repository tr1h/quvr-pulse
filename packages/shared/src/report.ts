import type { AppMode } from "./env";
import type { Confidence, SourcedValue } from "./sourced";

/**
 * Server-built text. Russian and English are always present; German, Spanish and Chinese are
 * optional and fall back to English (see pickText).
 */
export type LocalizedText = { ru: string; en: string; de?: string; es?: string; zh?: string };
export type Locale = "ru" | "en" | "de" | "es" | "zh";
export const LOCALES: readonly Locale[] = ["en", "ru", "de", "es", "zh"];

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** The text in the requested language, or English when that translation does not exist yet. */
export function pickText(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en;
}

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type FindingCategory = "contract" | "liquidity" | "distribution" | "social" | "data";

export type RiskFinding = {
  /** Stable code, e.g. "contract.mint.owner" — used for dedupe and alerts. */
  code: string;
  category: FindingCategory;
  severity: Severity;
  title: LocalizedText;
  explanation: LocalizedText;
  evidence: string[];
  source: string;
  sourceUrl?: string;
  confidence: Confidence;
};

export type ScoreKey =
  "contractSafety" | "liquidityHealth" | "distributionHealth" | "socialMomentum";

/** Risk wording required by product rules — never "safe". */
export type RiskLevel = "low" | "elevated" | "high" | "insufficient";
export type MomentumLevel = "strong" | "moderate" | "weak" | "insufficient";

export type ScoreComponent = {
  id: string;
  label: LocalizedText;
  /** null = could not be evaluated (excluded from the total, lowers confidence). */
  points: number | null;
  max: number;
  note?: LocalizedText;
};

export type ScoreReason = { text: LocalizedText; impact: "positive" | "negative" | "neutral" };

export type ScoreResult = {
  key: ScoreKey;
  /** 0..100, or null when there is not enough data. */
  value: number | null;
  confidence: Confidence;
  level: RiskLevel | MomentumLevel;
  reasons: ScoreReason[];
  components: ScoreComponent[];
  penalties: Array<{ label: LocalizedText; points: number }>;
  /** Share of max points that could actually be evaluated (0..1). */
  coverage: number;
  updatedAt: string;
};

export type PairInfo = {
  pairAddress: string;
  dexId: string;
  labels: string[];
  /** "v4" pools are identified by a 32-byte poolId inside the singleton PoolManager. */
  kind: "v2" | "v3" | "v4" | "unknown";
  baseToken: { address: string; symbol: string | null; name: string | null };
  quoteToken: { address: string; symbol: string | null; name: string | null };
  priceUsd: number | null;
  priceNative: number | null;
  liquidityUsd: number | null;
  liquidityBase: number | null;
  liquidityQuote: number | null;
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  txns: {
    m5: { buys: number; sells: number } | null;
    h1: { buys: number; sells: number } | null;
    h6: { buys: number; sells: number } | null;
    h24: { buys: number; sells: number } | null;
  };
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  fdvUsd: number | null;
  marketCapUsd: number | null;
  pairCreatedAt: string | null;
  url: string | null;
};

export type ExternalLink = { label: string; url: string; kind: "website" | "social" | "other" };

export type HolderRow = {
  address: string;
  balance: number;
  share: number; // 0..1 of circulating (non-excluded) supply
  shareOfTotal: number; // 0..1 of total supply
  isContract: boolean | null;
  tags: Array<"deployer" | "possibly-related" | "fresh" | "contract" | "eip7702">;
};

export type ExcludedHolder = {
  address: string;
  balance: number;
  shareOfTotal: number;
  reason:
    "zero" | "burn" | "dex-pool" | "pool-manager" | "launchpad" | "router" | "bridge" | "system";
  label: LocalizedText;
};

export type RelationSignal =
  | "funded-by-deployer"
  | "received-from-deployer"
  | "same-first-buy-block"
  | "sequential-transfers"
  | "common-funding-source"
  | "same-contract-set";

export type RelatedCluster = {
  id: string;
  wallets: string[];
  signals: Array<{ signal: RelationSignal; evidence: string }>;
  combinedShareOfTotal: number;
  linkedToDeployer: boolean;
  confidence: Confidence;
};

export type DeployerAction = {
  kind: "sell" | "buy" | "transfer-out" | "transfer-in" | "create";
  amount: number | null;
  counterparty: string | null;
  txHash: string;
  blockNumber: number;
  timestamp: string | null;
};

export type SimulationResult = {
  status: "passed" | "failed" | "unavailable";
  method: string;
  buy: { ok: boolean | null; detail: string } | null;
  sell: { ok: boolean | null; detail: string } | null;
  blockNumber: number | null;
  notes: LocalizedText;
};

export type ContractCapability = {
  id:
    | "mint"
    | "pause"
    | "blacklist"
    | "whitelist"
    | "fee-change"
    | "balance-modify"
    | "transfer-restriction"
    | "max-wallet-tx"
    | "trading-toggle"
    | "router-pair-change"
    | "ownership"
    | "upgrade"
    | "delegatecall"
    | "selfdestruct";
  present: boolean;
  /** How the presence was established. */
  evidence: string[];
  /** Did a read-only eth_call from the privileged account succeed? */
  probed: "succeeded" | "reverted" | "not-probed";
  gated: "owner" | "anyone" | "unknown" | "renounced";
};

export type ContractAnalysis = {
  isContract: boolean;
  codeHash: string | null;
  bytecodeSize: number | null;
  verified: boolean | null;
  contractName: string | null;
  compiler: string | null;
  proxy: {
    isProxy: boolean;
    kind: "eip1967" | "eip1167" | "beacon" | "explorer" | null;
    implementation: string | null;
    admin: string | null;
  };
  owner: {
    address: string | null;
    kind: "eoa" | "contract" | "renounced" | "none" | "unknown";
    isTimelock: boolean | null;
    timelockDelaySec: number | null;
    isMultisig: boolean | null;
  };
  capabilities: ContractCapability[];
  feeReadings: Array<{ fn: string; value: string }>;
  bytecodeMatchesSource: boolean | null;
  selectorsFound: number;
};

export type CreationInfo = {
  deployer: string | null;
  factory: string | null;
  txHash: string | null;
  blockNumber: number | null;
  timestamp: string | null;
  initialMintTo: string | null;
  method: "explorer" | "rpc-mint-log";
};

export type TimelineEvent = {
  at: string | null;
  blockNumber: number | null;
  kind:
    | "created"
    | "first-pool"
    | "first-buys"
    | "thesis"
    | "deployer-sell"
    | "large-sell"
    | "author-exit";
  title: LocalizedText;
  txHash?: string;
  source: string;
};

export type ThesisView = {
  id: string;
  authorHandle: string;
  authorName: string | null;
  text: string;
  createdAt: string;
  likes: number | null;
  isDev: boolean | null;
  tradeUsd: number | null;
  priceAtPublishNative: number | null;
  outcomes: Record<"15m" | "1h" | "6h" | "24h", number | null | "pending">;
  source: string;
};

export type AuthorStats = {
  handle: string;
  displayName: string | null;
  verified: boolean | null;
  evmWallet: string | null;
  sampleSize: number;
  closedTrades: number;
  realizedPnlUsd: number | null;
  medianRoi: number | null;
  winRate: number | null;
  winRateWilsonLower: number | null;
  maxDrawdownUsd: number | null;
  bestTradeShare: number | null;
  avgHoldSeconds: number | null;
  lastTradeAt: string | null;
  qualityScore: number | null;
  qualityConfidence: Confidence;
  qualityTier: "high" | "medium" | "low" | "insufficient";
  /** Where the trade sample came from (on-chain wallet, provider history or realtime stream). */
  source?: string;
  /** Median seconds from a thesis to the first sell of that token (on-chain). */
  medianSellAfterThesisSec?: number | null;
  /** Round trips excluded because part of the position had no swap price. */
  excludedTrades?: number;
  openPositions?: number;
};

export type PricePoint = { t: number; priceNative: number; priceUsd: number | null };
export type LiquidityPoint = { t: number; liquidityUsd: number };

export type SourceHealth = {
  source: string;
  status: "ok" | "degraded" | "down" | "disabled";
  circuit: "closed" | "open" | "half-open";
  successRate: number | null;
  p50LatencyMs: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  note?: string;
};

export type TokenReport = {
  chainId: number;
  chainName: string;
  /** Address format / explorer family (absent in reports stored before Solana support = "evm"). */
  chainFamily?: "evm" | "solana";
  address: string;
  checksumAddress: string;
  generatedAt: string;
  mode: AppMode;
  blockNumber: SourcedValue<number>;
  token: {
    name: SourcedValue<string>;
    symbol: SourcedValue<string>;
    decimals: SourcedValue<number>;
    totalSupply: SourcedValue<number>;
    imageUrl: string | null;
  };
  links: {
    blockscout: string;
    dexscreener: string | null;
    fomo: string | null;
    external: SourcedValue<ExternalLink[]>;
  };
  market: {
    priceUsd: SourcedValue<number>;
    priceNative: SourcedValue<number>;
    marketCapUsd: SourcedValue<number>;
    fdvUsd: SourcedValue<number>;
    liquidityUsd: SourcedValue<number>;
    volume: SourcedValue<PairInfo["volume"]>;
    txns: SourcedValue<PairInfo["txns"]>;
    priceChange: SourcedValue<PairInfo["priceChange"]>;
    pairs: SourcedValue<PairInfo[]>;
  };
  liquidity: {
    mainPair: SourcedValue<PairInfo>;
    mainPoolShare: SourcedValue<number>;
    liquidityToMcap: SourcedValue<number>;
    poolAgeHours: SourcedValue<number>;
    netFlowNative: SourcedValue<{ h1: number; h24: number; buysH24: number; sellsH24: number }>;
    priceImpact: SourcedValue<Array<{ usd: number; impactPct: number }>>;
    liquidityTrend: SourcedValue<{ changePct: number; windowHours: number }>;
  };
  contract: SourcedValue<ContractAnalysis>;
  creation: SourcedValue<CreationInfo>;
  simulation: SourcedValue<SimulationResult>;
  distribution: {
    holdersCount: SourcedValue<number>;
    top: SourcedValue<HolderRow[]>;
    concentration: SourcedValue<{ top1: number; top5: number; top10: number; top20: number }>;
    excluded: SourcedValue<ExcludedHolder[]>;
    deployerShare: SourcedValue<number>;
    relatedShare: SourcedValue<number>;
    clusters: SourcedValue<RelatedCluster[]>;
    holderGrowth: SourcedValue<{ h1: number; h24: number }>;
    newWallets24h: SourcedValue<number>;
    freshWalletShare: SourcedValue<number>;
    massTransfers: SourcedValue<{ count: number; largestFanOut: number }>;
  };
  deployerActions: SourcedValue<DeployerAction[]>;
  social: {
    available: boolean;
    reason: LocalizedText | null;
    theses: SourcedValue<ThesisView[]>;
    authors: SourcedValue<AuthorStats[]>;
    trendingRank: SourcedValue<number>;
    trackedHolders: SourcedValue<Array<{ handle: string; valueUsd: number | null }>>;
  };
  history: {
    price: SourcedValue<PricePoint[]>;
    liquidity: SourcedValue<LiquidityPoint[]>;
  };
  timeline: TimelineEvent[];
  findings: RiskFinding[];
  scores: Record<ScoreKey, ScoreResult>;
  sources: SourceHealth[];
};
