import { z } from "zod";
import { ProviderError } from "../errors";
import { allowHost, fetchJson } from "../http";

/**
 * Read-only Solana JSON-RPC access. Verified 2026-09-23:
 *  - getAccountInfo(jsonParsed) / getTokenSupply work on the public endpoint;
 *  - getTokenLargestAccounts is blocked on free public RPCs (method-level 429 / "personal
 *    token required") → holders need SOLANA_RPC_URL with a key (Helius, Alchemy, QuickNode).
 * There is no method that signs or sends transactions.
 */
export type SolanaMintInfo = {
  program: "spl-token" | "spl-token-2022" | "other";
  programId: string;
  decimals: number;
  supplyRaw: bigint;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Token-2022 extensions as parsed by the RPC (extension name → state). */
  extensions: Array<{ extension: string; state: Record<string, unknown> }>;
};

export type SolanaLargestAccount = { account: string; amountRaw: bigint; uiAmount: number | null };
export type SolanaAccountOwner = {
  account: string;
  owner: string | null;
  ownerProgram: string | null;
};

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const rpcEnvelope = z.object({
  result: z.unknown().optional(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional(),
});

export type SolanaSignature = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
};

/** Parsed transaction from the Helius Enhanced Transactions API. */
export type EnhancedTx = {
  signature: string;
  timestamp: number | null;
  type: string;
  source: string | null;
  feePayer: string | null;
  tokenTransfers: Array<{
    fromUserAccount: string | null;
    toUserAccount: string | null;
    mint: string;
    tokenAmount: number;
  }>;
  nativeTransfers: Array<{
    fromUserAccount: string | null;
    toUserAccount: string | null;
    amount: number;
  }>;
};

export class SolanaRpc {
  readonly name: string;

  constructor(
    private readonly url: string,
    readonly keyed: boolean,
  ) {
    this.name = "solana-rpc";
    allowHost(url);
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const json = await fetchJson(this.name, this.url, {
      method: "POST",
      body: { jsonrpc: "2.0", id: 1, method, params },
      timeoutMs: 15_000,
      retries: 2,
    });
    const env = rpcEnvelope.parse(json);
    if (env.error) {
      const limited =
        env.error.code === 429 || /too many|personal token|upgrade/i.test(env.error.message);
      throw new ProviderError(
        this.name,
        limited ? "rate-limited" : "rpc",
        `${method}: ${env.error.message}`,
        {
          retryable: limited,
        },
      );
    }
    return env.result as T;
  }

  async getMint(mint: string): Promise<SolanaMintInfo | null> {
    const r = await this.call<{
      value: null | {
        owner: string;
        data: { parsed?: { type: string; info: Record<string, unknown> } };
      };
    }>("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const v = r.value;
    if (!v || v.data?.parsed?.type !== "mint") return null;
    const info = v.data.parsed.info;
    const ext = Array.isArray(info.extensions)
      ? (info.extensions as Array<{ extension: string; state?: Record<string, unknown> }>)
      : [];
    return {
      program:
        v.owner === TOKEN_PROGRAM
          ? "spl-token"
          : v.owner === TOKEN_2022_PROGRAM
            ? "spl-token-2022"
            : "other",
      programId: v.owner,
      decimals: Number(info.decimals),
      supplyRaw: BigInt(String(info.supply)),
      mintAuthority: typeof info.mintAuthority === "string" ? info.mintAuthority : null,
      freezeAuthority: typeof info.freezeAuthority === "string" ? info.freezeAuthority : null,
      extensions: ext.map((e) => ({ extension: String(e.extension), state: e.state ?? {} })),
    };
  }

  async getLargestAccounts(mint: string): Promise<SolanaLargestAccount[]> {
    const r = await this.call<{
      value: Array<{ address: string; amount: string; uiAmount: number | null }>;
    }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    return r.value.map((a) => ({
      account: a.address,
      amountRaw: BigInt(a.amount),
      uiAmount: a.uiAmount,
    }));
  }

  async getAccountData(address: string): Promise<{ owner: string; data: Uint8Array } | null> {
    const r = await this.call<{ value: null | { owner: string; data: [string, string] } }>(
      "getAccountInfo",
      [address, { encoding: "base64" }],
    );
    if (!r.value) return null;
    return { owner: r.value.owner, data: Uint8Array.from(Buffer.from(r.value.data[0], "base64")) };
  }

  /**
   * Oldest-first history (Helius getTransactionsForAddress). Returns null on providers that do
   * not support it (standard RPC can only page newest-first).
   */
  async getOldestSignatures(address: string, limit = 3): Promise<SolanaSignature[] | null> {
    try {
      const r = await this.call<{
        data: Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>;
      }>("getTransactionsForAddress", [
        address,
        { transactionDetails: "signatures", sortOrder: "asc", limit },
      ]);
      return r.data.map((x) => ({
        signature: x.signature,
        slot: x.slot,
        blockTime: x.blockTime ?? null,
        err: x.err ?? null,
      }));
    } catch (e) {
      if (e instanceof ProviderError && e.kind === "rpc") return null; // method not supported
      throw e;
    }
  }

  /** Newest-first signatures (standard RPC), used to measure how busy an address is. */
  async getRecentSignatures(address: string, limit = 1000): Promise<SolanaSignature[]> {
    const r = await this.call<
      Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>
    >("getSignaturesForAddress", [address, { limit }]);
    return r.map((x) => ({
      signature: x.signature,
      slot: x.slot,
      blockTime: x.blockTime ?? null,
      err: x.err ?? null,
    }));
  }

  /** Fee payer (first signer) and time of a transaction. */
  async getTransactionPayer(
    signature: string,
  ): Promise<{ feePayer: string | null; blockTime: number | null; slot: number | null } | null> {
    const r = await this.call<null | {
      slot: number;
      blockTime: number | null;
      transaction: {
        message: { accountKeys: Array<{ pubkey: string; signer: boolean } | string> };
      };
    }>("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!r) return null;
    const k = r.transaction.message.accountKeys[0];
    return {
      feePayer: typeof k === "string" ? k : (k?.pubkey ?? null),
      blockTime: r.blockTime ?? null,
      slot: r.slot ?? null,
    };
  }

  /** Raw balance of a mint held by an owner across its token accounts. */
  async getOwnerBalance(owner: string, mint: string): Promise<bigint> {
    const r = await this.call<{
      value: Array<{
        account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } };
      }>;
    }>("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
    return r.value.reduce((s, v) => s + BigInt(v.account.data.parsed.info.tokenAmount.amount), 0n);
  }

  /** Helius Enhanced Transactions API (newest first, up to pages × 100). null without a Helius key. */
  async getEnhancedTransactions(address: string, pages = 1): Promise<EnhancedTx[] | null> {
    const key = heliusKey(this.url);
    if (!key) return null;
    const out: EnhancedTx[] = [];
    let before: string | null = null;
    for (let i = 0; i < pages; i++) {
      const q = new URLSearchParams({ "api-key": key, limit: "100" });
      if (before) q.set("before", before);
      const json = await fetchJson(
        "helius-enhanced",
        `https://api.helius.xyz/v0/addresses/${address}/transactions?${q}`,
        {
          timeoutMs: 20_000,
          retries: 1,
        },
      );
      const list = z.array(z.record(z.unknown())).safeParse(json);
      if (!list.success || list.data.length === 0) break;
      for (const t of list.data) {
        out.push({
          signature: String(t.signature),
          timestamp: typeof t.timestamp === "number" ? t.timestamp : null,
          type: String(t.type ?? "UNKNOWN"),
          source: typeof t.source === "string" ? t.source : null,
          feePayer: typeof t.feePayer === "string" ? t.feePayer : null,
          tokenTransfers: (Array.isArray(t.tokenTransfers) ? t.tokenTransfers : []).map(
            (x: Record<string, unknown>) => ({
              fromUserAccount:
                typeof x.fromUserAccount === "string" && x.fromUserAccount
                  ? x.fromUserAccount
                  : null,
              toUserAccount:
                typeof x.toUserAccount === "string" && x.toUserAccount ? x.toUserAccount : null,
              mint: String(x.mint ?? ""),
              tokenAmount: Number(x.tokenAmount ?? 0),
            }),
          ),
          nativeTransfers: (Array.isArray(t.nativeTransfers) ? t.nativeTransfers : []).map(
            (x: Record<string, unknown>) => ({
              fromUserAccount:
                typeof x.fromUserAccount === "string" && x.fromUserAccount
                  ? x.fromUserAccount
                  : null,
              toUserAccount:
                typeof x.toUserAccount === "string" && x.toUserAccount ? x.toUserAccount : null,
              amount: Number(x.amount ?? 0),
            }),
          ),
        });
      }
      before = String(list.data[list.data.length - 1]!.signature);
      if (list.data.length < 100) break;
    }
    return out;
  }

  /** Token-account → owner (wallet or program PDA) and the program that owns the owner account. */
  async getAccountOwners(accounts: string[]): Promise<SolanaAccountOwner[]> {
    if (!accounts.length) return [];
    const r = await this.call<{
      value: Array<null | { data: { parsed?: { info?: { owner?: string } } } }>;
    }>("getMultipleAccounts", [accounts, { encoding: "jsonParsed" }]);
    const owners = r.value.map((v) => v?.data?.parsed?.info?.owner ?? null);
    const known = owners.filter((o): o is string => !!o);
    const ownerAccts = known.length
      ? await this.call<{ value: Array<null | { owner: string }> }>("getMultipleAccounts", [
          known,
          { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
        ])
      : { value: [] };
    const programOf = new Map(known.map((o, i) => [o, ownerAccts.value[i]?.owner ?? null]));
    return accounts.map((account, i) => ({
      account,
      owner: owners[i] ?? null,
      ownerProgram: owners[i] ? (programOf.get(owners[i]!) ?? null) : null,
    }));
  }
}

function heliusKey(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("helius-rpc.com") ? u.searchParams.get("api-key") : null;
  } catch {
    return null;
  }
}

let singleton: SolanaRpc | null = null;

export function getSolanaRpc(): SolanaRpc {
  if (!singleton) {
    const custom = process.env.SOLANA_RPC_URL?.trim();
    singleton = new SolanaRpc(custom || "https://api.mainnet-beta.solana.com", !!custom);
  }
  return singleton;
}
