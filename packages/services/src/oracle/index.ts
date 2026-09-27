import { getDb } from "@quvr/db";
import { oracleLabel, oracleSignature, type OracleLabel } from "@quvr/scoring";
import {
  logger,
  ROBINHOOD_MAINNET,
  ROBINHOOD_TESTNET,
  type ChainConfig,
  type TokenReport,
} from "@quvr/shared";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  TransactionReceiptNotFoundError,
  formatEther,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseEther,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { cacheGet, cacheSet } from "../cache";
import { acquireLease } from "../lease";
import {
  dailyLimit,
  pendingPublication,
  reservePublication,
  deliverPublication,
  type Publication,
  type PublishedLabel,
} from "./journal";
import { getRedis } from "../redis";
import { safeDb } from "../persistence";
import { ORACLE_ABI, ORACLE_BYTECODE } from "./artifact";
import { CREATE2_ABI, CREATE2_BYTECODE, HOOK_ABI, HOOK_BYTECODE } from "./hook-artifact";
import { oraclePublicationBudget } from "./budget";
export { oraclePublicationBudget };
export { ORACLE_INTERVAL_MS } from "./pacing";

/**
 * QUVR Risk Oracle: publishes risk labels of Robinhood Chain tokens to QuvrRiskOracle.sol.
 * Config (server env only): ORACLE_NETWORK (robinhood | robinhood-testnet), ORACLE_ADDRESS,
 * ORACLE_PUBLISHER_KEY. The key is never logged, printed or sent anywhere but the RPC signer.
 */
const log = logger.child({ scope: "oracle" });

/** Only tokens with real liquidity are published (gas is spent where labels matter). */
const MIN_LIQUIDITY_USD = 5_000;
/** Unchanged labels are republished every three days. */
const REPUBLISH_AFTER_MS = 3 * 86_400_000;
/** Hard cap on labels per UTC day (gas budget); override with ORACLE_DAILY_LIMIT. */
const DAILY_LIMIT = dailyLimit();
const MIN_BALANCE = parseEther("0.0003");
/** Per-contract keys: a redeployed oracle gets every label again. */
const logKey = (oracle: string) => `oracle:log:v1:${oracle.toLowerCase()}`;
const lastKey = (oracle: string, token: string) => `oracle:last:${oracle.toLowerCase()}:${token}`;

export type OracleLogEntry = {
  token: string;
  symbol: string | null;
  level: number;
  flags: number;
  tx: string;
  at: string;
};

function network(): ChainConfig {
  return process.env.ORACLE_NETWORK === "robinhood-testnet" ? ROBINHOOD_TESTNET : ROBINHOOD_MAINNET;
}

function rpcUrl(net: ChainConfig): string {
  // ORACLE_RPC_URL lets the signer use its own endpoint (also local forks in tests).
  if (process.env.ORACLE_RPC_URL) return process.env.ORACLE_RPC_URL;
  return net.id === ROBINHOOD_TESTNET.id
    ? process.env.ROBINHOOD_TESTNET_RPC_URL || net.publicRpcUrl
    : process.env.ROBINHOOD_RPC_URL || net.publicRpcUrl;
}

function viemChain(net: ChainConfig) {
  return defineChain({
    id: net.id,
    name: net.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl(net)] } },
    blockExplorers: { default: { name: "Blockscout", url: net.explorerUrl } },
  });
}

function publisherKey(): Hex | null {
  const k = process.env.ORACLE_PUBLISHER_KEY?.trim();
  if (!k) return null;
  const hex = (k.startsWith("0x") ? k : `0x${k}`) as Hex;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex : null;
}

function oracleAddress(): Address | null {
  const a = process.env.ORACLE_ADDRESS?.trim();
  return a && isAddress(a) ? getAddress(a) : null;
}

export type OracleInfo = {
  enabled: boolean;
  network: string;
  chainId: number;
  address: string | null;
  publisher: string | null;
  explorerUrl: string;
  /** Uniswap v4 hook that reads this oracle (QUVR_HOOK_ADDRESS). */
  hook: string | null;
  poolManager: string | null;
};

/** Public facts about the deployment (no secrets): for the website and status. */
export function oracleInfo(): OracleInfo {
  const net = network();
  const key = publisherKey();
  const address = oracleAddress();
  return {
    enabled: !!(key && address),
    network: net.name,
    chainId: net.id,
    address,
    publisher: key ? privateKeyToAccount(key).address : null,
    explorerUrl: net.explorerUrl,
    hook:
      process.env.QUVR_HOOK_ADDRESS && isAddress(process.env.QUVR_HOOK_ADDRESS)
        ? getAddress(process.env.QUVR_HOOK_ADDRESS)
        : null,
    poolManager: net.uniswapV4PoolManager ? getAddress(net.uniswapV4PoolManager) : null,
  };
}

function clients() {
  const net = network();
  const key = publisherKey();
  if (!key) throw new Error("ORACLE_PUBLISHER_KEY is not set");
  const chain = viemChain(net);
  const account = privateKeyToAccount(key);
  return {
    net,
    account,
    pub: createPublicClient({ chain, transport: http(rpcUrl(net), { timeout: 20_000 }) }),
    wallet: createWalletClient({
      chain,
      account,
      transport: http(rpcUrl(net), { timeout: 20_000 }),
    }),
  };
}

/** One-time deployment (run from the server). Owner and first publisher = the server key. */
export async function deployOracle(): Promise<{ address: Address; tx: Hex; network: string }> {
  const { net, account, pub, wallet } = clients();
  const balance = await pub.getBalance({ address: account.address });
  if (balance < MIN_BALANCE)
    throw new Error(
      `publisher ${account.address} has ${formatEther(balance)} ETH on ${net.name}; fund it first`,
    );
  const tx = await wallet.deployContract({
    abi: ORACLE_ABI,
    bytecode: ORACLE_BYTECODE,
    args: [account.address, account.address],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (!receipt.contractAddress) throw new Error(`deployment failed: ${tx}`);
  return { address: receipt.contractAddress, tx, network: net.name };
}

type Candidate = { address: string; report: TokenReport };

/** Label id linking the on-chain entry to the report version it came from. */
export function reportId(chainId: number, address: string, generatedAt: string): Hex {
  return keccak256(toBytes(`quvr:${chainId}:${address.toLowerCase()}:${generatedAt}`));
}

/**
 * Worker job: publishes new or changed labels for liquid Robinhood Chain tokens, in one batch
 * transaction. Returns how many labels were written (0 when disabled or nothing is due).
 */
export async function publishOracleLabels(limit = 20): Promise<number> {
  const info = oracleInfo();
  if (!info.enabled || !info.address) return 0;
  const redis = getRedis();
  if (!redis || redis.status !== "ready") {
    log.warn("oracle skipped", { reason: "redis_unavailable" });
    return 0;
  }
  const release = await acquireLease("oracle-publish", 5 * 60_000);
  if (!release) return 0;
  try {
    const pending = await pendingPublication();
    if (pending) {
      if (pending.chainId !== network().id)
        throw new Error("pending publication belongs to another network");
      return await resumePublication(pending);
    }
    const pacing = await oraclePublicationBudget();
    const { day, remaining, used: legacySpent } = pacing;
    if (!remaining) {
      log.info("oracle skipped", {
        reason: "daily_limit",
        used: legacySpent,
        limit: DAILY_LIMIT,
      });
      return 0;
    }
    if (!pacing.windowRemaining) {
      log.info("oracle skipped", { reason: "window_limit", nextWindowAt: pacing.nextWindowAt });
      return 0;
    }
    limit = Math.min(Math.max(0, Math.floor(limit)), remaining, pacing.windowRemaining);
    if (!Number.isFinite(limit) || !limit) return 0;
    const recent = await getDb().oraclePublication.findMany({
      where: {
        oracle: info.address.toLowerCase(),
        chainId: network().id,
        status: "confirmed",
        completedAt: { gte: new Date(Date.now() - REPUBLISH_AFTER_MS) },
      },
      orderBy: { completedAt: "asc" },
      select: { labels: true, completedAt: true },
    });
    const recorded = new Map<string, { sig: string; at: number }>();
    for (const batch of recent)
      for (const item of batch.labels as unknown as PublishedLabel[])
        recorded.set(item.token, { sig: item.sig, at: batch.completedAt!.getTime() });
    const rows = await safeDb(
      "oracle-candidates",
      () =>
        getDb().$queryRaw<Array<{ address: string; report: TokenReport }>>`
          SELECT address,
            -- Only what the label needs: full reports are large and 200 of them exhausted the
            -- worker's heap (OOM restarts every 30 minutes, no labels written).
            jsonb_build_object(
              'generatedAt', "lastReport"::jsonb->'generatedAt',
              'token', jsonb_build_object('symbol', "lastReport"::jsonb->'token'->'symbol'),
              'scores', jsonb_build_object(
                'contractSafety', jsonb_build_object(
                  'level', "lastReport"::jsonb->'scores'->'contractSafety'->'level',
                  'value', "lastReport"::jsonb->'scores'->'contractSafety'->'value'),
                'liquidityHealth', jsonb_build_object(
                  'level', "lastReport"::jsonb->'scores'->'liquidityHealth'->'level',
                  'value', "lastReport"::jsonb->'scores'->'liquidityHealth'->'value'),
                'distributionHealth', jsonb_build_object(
                  'level', "lastReport"::jsonb->'scores'->'distributionHealth'->'level',
                  'value', "lastReport"::jsonb->'scores'->'distributionHealth'->'value')),
              'findings', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('code', f->>'code', 'severity', f->>'severity'))
                FROM jsonb_array_elements("lastReport"::jsonb->'findings') f), '[]'::jsonb)
            ) AS report
          FROM "Token"
          WHERE "chainId" = ${ROBINHOOD_MAINNET.id}
            AND "lastScannedAt" > now() - interval '3 hours'
            AND jsonb_typeof("lastReport"::jsonb->'market'->'liquidityUsd'->'value') = 'number'
            AND ("lastReport"::jsonb->'market'->'liquidityUsd'->>'value')::float >= ${MIN_LIQUIDITY_USD}
          ORDER BY ("lastReport"::jsonb->'market'->'liquidityUsd'->>'value')::float DESC
          LIMIT 200`,
      [] as Candidate[],
    );
    const due: Array<{ c: Candidate; label: OracleLabel; sig: string }> = [];
    for (const c of rows) {
      if (!c.report?.scores) continue;
      const label = oracleLabel(c.report);
      const sig = oracleSignature(label);
      const last =
        recorded.get(c.address) ??
        (await cacheGet<{ sig: string; at: number }>(lastKey(info.address, c.address)))?.value;
      if (last && last.sig === sig && Date.now() - last.at < REPUBLISH_AFTER_MS) continue;
      due.push({ c, label, sig });
      if (due.length >= limit) break;
    }
    if (!due.length) {
      log.info("oracle skipped", { reason: "no_due_labels" });
      return 0;
    }

    const { account, pub, wallet, net } = clients();
    const balance = await pub.getBalance({ address: account.address });
    if (balance < MIN_BALANCE) {
      log.warn("publisher balance too low, skipping", { balance: formatEther(balance) });
      return 0;
    }
    const data = encodeFunctionData({
      abi: ORACLE_ABI,
      functionName: "publishBatch",
      args: [
        due.map((d) => getAddress(d.c.address)),
        due.map((d) => ({
          ...d.label,
          reportHash: reportId(net.id, d.c.address, d.c.report.generatedAt),
        })),
      ],
    });
    const request = await wallet.prepareTransactionRequest({
      account,
      to: info.address as Address,
      data,
    });
    const rawTransaction = await wallet.signTransaction(request);
    const hash = keccak256(rawTransaction);
    const entry = await reservePublication(
      {
        hash,
        rawTransaction,
        chainId: net.id,
        oracle: info.address.toLowerCase(),
        day,
        labelCount: due.length,
        labels: due.map((d) => ({
          token: d.c.address,
          symbol: d.c.report.token?.symbol?.value ?? null,
          sig: d.sig,
          label: d.label,
        })),
      },
      DAILY_LIMIT,
      legacySpent,
    );
    if (!entry) {
      log.info("oracle skipped", { reason: "budget_or_reservation_changed" });
      return 0;
    }
    if (entry.chainId !== net.id) throw new Error("pending publication belongs to another network");
    return await resumePublication(entry);
  } finally {
    await release();
  }
}

async function resumePublication(entry: Publication): Promise<number> {
  const { pub, wallet } = clients();
  return deliverPublication(entry, {
    receipt: async (hash) => {
      try {
        return await pub.getTransactionReceipt({ hash });
      } catch (e) {
        if (e instanceof TransactionReceiptNotFoundError) return null;
        throw e;
      }
    },
    send: (raw) => wallet.sendRawTransaction({ serializedTransaction: raw }),
    wait: (hash) => pub.waitForTransactionReceipt({ hash, timeout: 120_000 }),
    finalize: async (batch, status) => {
      const now = new Date();
      await getDb().oraclePublication.update({
        where: { hash: batch.hash },
        data: {
          status: status === "success" ? "confirmed" : "reverted",
          completedAt: now,
        },
      });
      if (status === "success") {
        for (const item of batch.labels as PublishedLabel[])
          await cacheSet(
            lastKey(batch.oracle, item.token),
            { sig: item.sig, at: now.getTime(), tx: batch.hash },
            7 * 86_400,
          );
      }
      log.info("oracle transaction reconciled", {
        tx: batch.hash,
        status,
        count: batch.labelCount,
      });
    },
  });
}

/** Latest publications (newest first) for the Oracle page. */
export async function oracleLog(): Promise<OracleLogEntry[]> {
  const address = oracleAddress();
  if (!address) return [];
  const legacy = (await cacheGet<OracleLogEntry[]>(logKey(address)))?.value ?? [];
  const batches = await getDb().oraclePublication.findMany({
    where: { oracle: address.toLowerCase(), chainId: network().id, status: "confirmed" },
    orderBy: { completedAt: "desc" },
    take: 100,
    select: { labels: true, hash: true, completedAt: true },
  });
  const entries = batches.flatMap((batch) =>
    (batch.labels as unknown as PublishedLabel[]).map((item) => ({
      token: item.token,
      symbol: item.symbol,
      level: item.label.level,
      flags: item.label.flags,
      tx: batch.hash,
      at: batch.completedAt!.toISOString(),
    })),
  );
  return [...entries, ...legacy].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
}

/** Publisher balance (ETH, as a string) for the admin status; null when disabled/unreachable. */
export async function oracleBalance(): Promise<string | null> {
  if (!publisherKey()) return null;
  try {
    const { account, pub } = clients();
    return formatEther(await pub.getBalance({ address: account.address }));
  } catch {
    return null;
  }
}

export { ORACLE_ABI } from "./artifact";

/** Hook permission bits live in the low 14 bits of its address (Uniswap v4). */
const BEFORE_SWAP_FLAG = 1n << 7n;
const ALL_HOOK_MASK = (1n << 14n) - 1n;
/** Labels older than this are ignored by the hook. */
export const HOOK_MAX_AGE_SECONDS = 3n * 86_400n;

function mineHookSalt(factory: Address, initCode: Hex): Hex {
  const codeHash = keccak256(initCode).slice(2);
  for (let i = 0n; i < 5_000_000n; i++) {
    const salt = toHex(i, { size: 32 });
    const addr = BigInt(
      `0x${keccak256(`0xff${factory.slice(2)}${salt.slice(2)}${codeHash}` as Hex).slice(-40)}`,
    );
    if ((addr & ALL_HOOK_MASK) === BEFORE_SWAP_FLAG) return salt;
  }
  throw new Error("no hook salt found");
}

/**
 * One-time deployment of QuvrRiskHook for Uniswap v4 on Robinhood Chain: a CREATE2 factory, then
 * the hook at a mined address carrying only the beforeSwap permission bit.
 */
export async function deployHook(): Promise<{ hook: Address; factory: Address; txs: Hex[] }> {
  const { net, account, pub, wallet } = clients();
  const oracle = oracleAddress();
  if (!oracle) throw new Error("ORACLE_ADDRESS is not set");
  if (!net.uniswapV4PoolManager) throw new Error(`no Uniswap v4 PoolManager on ${net.name}`);
  const balance = await pub.getBalance({ address: account.address });
  if (balance < MIN_BALANCE) throw new Error(`balance too low: ${formatEther(balance)} ETH`);

  const txs: Hex[] = [];
  let factory =
    process.env.HOOK_FACTORY && isAddress(process.env.HOOK_FACTORY)
      ? getAddress(process.env.HOOK_FACTORY)
      : null;
  if (!factory) {
    const tx = await wallet.deployContract({ abi: CREATE2_ABI, bytecode: CREATE2_BYTECODE });
    txs.push(tx);
    const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
    if (!r.contractAddress) throw new Error(`factory deployment failed: ${tx}`);
    factory = r.contractAddress;
  }
  const initCode = encodeDeployData({
    abi: HOOK_ABI,
    bytecode: HOOK_BYTECODE,
    args: [getAddress(net.uniswapV4PoolManager), oracle, HOOK_MAX_AGE_SECONDS],
  });
  const salt = mineHookSalt(factory, initCode);
  const tx = await wallet.writeContract({
    address: factory,
    abi: CREATE2_ABI,
    functionName: "deploy",
    args: [salt, initCode],
  });
  txs.push(tx);
  const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (r.status !== "success") throw new Error(`hook deployment reverted: ${tx}`);
  const hook = getAddress(
    `0x${keccak256(`0xff${factory.slice(2)}${salt.slice(2)}${keccak256(initCode).slice(2)}` as Hex).slice(-40)}`,
  );
  const code = await pub.getCode({ address: hook });
  if (!code || code === "0x") throw new Error(`no code at hook address ${hook}`);
  return { hook, factory, txs };
}

// ------------------------------------------------------------------ public reads (website)

const statsKeys = (oracle: string) => ({
  labels: `quvr:oracle:labels:${oracle.toLowerCase()}`,
  tokens: `quvr:oracle:tokens:${oracle.toLowerCase()}`,
});

/** Totals for the Oracle page (null when Redis is unavailable). */
export async function oracleStats(): Promise<{ labels: number | null; tokens: number | null }> {
  const address = oracleAddress();
  const r = getRedis();
  if (!address || !r) return { labels: null, tokens: null };
  const k = statsKeys(address);
  try {
    const [labels, tokens] = await Promise.all([r.get(k.labels), r.scard(k.tokens)]);
    const [totals] = await getDb().$queryRaw<Array<{ labels: number; tokens: string[] }>>`
      SELECT COALESCE((SELECT sum("labelCount")::int FROM "OraclePublication"
        WHERE oracle = ${address.toLowerCase()} AND "chainId" = ${network().id} AND status = 'confirmed'), 0) AS labels,
        ARRAY(SELECT DISTINCT lower(item->>'token') FROM "OraclePublication",
          LATERAL jsonb_array_elements(labels) item
          WHERE oracle = ${address.toLowerCase()} AND "chainId" = ${network().id} AND status = 'confirmed') AS tokens
    `;
    const uniqueTokens = new Set(await r.smembers(k.tokens));
    for (const token of totals?.tokens ?? []) uniqueTokens.add(token);
    return {
      labels: Number(labels ?? 0) + (totals?.labels ?? 0),
      tokens: Math.max(tokens, uniqueTokens.size),
    };
  } catch {
    return { labels: null, tokens: null };
  }
}

/** One-time: rebuilds the counters from on-chain events (run from the server CLI). */
export async function seedOracleStats(
  fromBlock: bigint,
): Promise<{ labels: number; tokens: number }> {
  const address = oracleAddress();
  const r = getRedis();
  if (!address || !r) throw new Error("oracle address or Redis missing");
  const { pub } = clients();
  const latest = await pub.getBlockNumber();
  let labels = 0;
  const tokens = new Set<string>();
  for (let from = fromBlock; from <= latest; from += 50_000n) {
    const to = from + 49_999n > latest ? latest : from + 49_999n;
    const logs = await pub.getContractEvents({
      address,
      abi: ORACLE_ABI,
      eventName: "AssessmentPublished",
      fromBlock: from,
      toBlock: to,
    });
    labels += logs.length;
    for (const l of logs) if (l.args.token) tokens.add(l.args.token.toLowerCase());
  }
  const k = statsKeys(address);
  const journaled = await getDb().oraclePublication.aggregate({
    where: { oracle: address.toLowerCase(), chainId: network().id, status: "confirmed" },
    _sum: { labelCount: true },
  });
  await r.set(k.labels, String(Math.max(0, labels - (journaled._sum.labelCount ?? 0))));
  await r.del(k.tokens);
  if (tokens.size) await r.sadd(k.tokens, ...tokens);
  return { labels, tokens: tokens.size };
}

export type OnChainLabel = {
  level: number;
  contractScore: number;
  liquidityScore: number;
  distributionScore: number;
  flags: number;
  updatedAt: string;
  firstLabeledAt: string;
  firstHighAt: string | null;
  labelCount: number;
  /** Transaction of our latest write for this token, when known. */
  tx: string | null;
  oracle: string;
};

/**
 * The token's label as stored in QuvrRiskOracle (Robinhood Chain tokens only). Cached 10 min;
 * null when the oracle is off, the token was never labelled, or the chain is unreachable.
 */
export async function onChainLabel(token: string): Promise<OnChainLabel | null> {
  const address = oracleAddress();
  if (!address || !isAddress(token)) return null;
  const key = `oracle:onchain:${address.toLowerCase()}:${token.toLowerCase()}`;
  const hit = await cacheGet<OnChainLabel | "none">(key);
  if (hit) return hit.value === "none" ? null : hit.value;
  try {
    const { pub } = clients();
    const a = await pub.readContract({
      address,
      abi: ORACLE_ABI,
      functionName: "getAssessment",
      args: [getAddress(token)],
    });
    if (a.level === 0) {
      await cacheSet(key, "none", 600);
      return null;
    }
    const last = await cacheGet<{ tx?: string }>(lastKey(address, token.toLowerCase()));
    const iso = (s: number) => new Date(s * 1000).toISOString();
    const out: OnChainLabel = {
      level: a.level,
      contractScore: a.contractScore,
      liquidityScore: a.liquidityScore,
      distributionScore: a.distributionScore,
      flags: a.flags,
      updatedAt: iso(Number(a.updatedAt)),
      firstLabeledAt: iso(Number(a.firstLabeledAt)),
      firstHighAt: a.firstHighAt ? iso(Number(a.firstHighAt)) : null,
      labelCount: a.labelCount,
      tx: last?.value.tx ?? null,
      oracle: address,
    };
    await cacheSet(key, out, 600);
    return out;
  } catch {
    return null;
  }
}
