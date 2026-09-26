import { z } from "zod";
import type { ChainConfig } from "@quvr/shared";
import { ProviderError } from "../errors";
import { fetchJson } from "../http";

export type ExplorerAddressInfo = {
  isContract: boolean | null;
  isVerified: boolean | null;
  creator: string | null;
  creationTxHash: string | null;
  name: string | null;
  proxyType: string | null;
  implementations: string[];
};

export type ExplorerContractSource = {
  verified: boolean;
  name: string | null;
  compiler: string | null;
  sourceCode: string | null;
  abi: unknown[] | null;
  deployedBytecode: string | null;
  proxyType: string | null;
  implementations: string[];
};

export type ExplorerHolder = {
  address: string;
  valueRaw: bigint;
  isContract: boolean | null;
  name: string | null;
};
export type ExplorerTx = {
  hash: string;
  from: string;
  to: string | null;
  valueWei: bigint;
  timestamp: string | null;
  blockNumber: number | null;
};

export interface ExplorerProvider {
  readonly name: string;
  /** False when no API key is configured and the public API is known to be blocked. */
  isConfigured(): boolean;
  explorerUrl(): string;
  getAddressInfo(address: string): Promise<ExplorerAddressInfo | null>;
  getContractSource(address: string): Promise<ExplorerContractSource | null>;
  getTokenHoldersCount(address: string): Promise<number | null>;
  getTokenHolders(address: string, limit: number): Promise<ExplorerHolder[]>;
  /** Oldest incoming transactions — used for the "common funding source" heuristic. */
  getFirstIncomingTransactions(address: string, limit: number): Promise<ExplorerTx[]>;
}

const hash = z.string().regex(/^0x[0-9a-fA-F]+$/);
const addrObj = z
  .object({ hash, is_contract: z.boolean().nullish(), name: z.string().nullish() })
  .passthrough();

const addressSchema = z
  .object({
    is_contract: z.boolean().nullish(),
    is_verified: z.boolean().nullish(),
    creator_address_hash: hash.nullish(),
    creation_transaction_hash: hash.nullish(),
    creation_tx_hash: hash.nullish(),
    name: z.string().nullish(),
    proxy_type: z.string().nullish(),
    implementations: z
      .array(z.object({ address: hash.nullish(), address_hash: hash.nullish() }).passthrough())
      .nullish(),
  })
  .passthrough();

const smartContractSchema = z
  .object({
    is_verified: z.boolean().nullish(),
    name: z.string().nullish(),
    compiler_version: z.string().nullish(),
    source_code: z.string().nullish(),
    abi: z.array(z.unknown()).nullish(),
    deployed_bytecode: z.string().nullish(),
    proxy_type: z.string().nullish(),
    implementations: z
      .array(z.object({ address: hash.nullish(), address_hash: hash.nullish() }).passthrough())
      .nullish(),
  })
  .passthrough();

const tokenSchema = z
  .object({
    holders: z.union([z.string(), z.number()]).nullish(),
    holders_count: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();
const holdersSchema = z
  .object({ items: z.array(z.object({ address: addrObj, value: z.string() }).passthrough()) })
  .passthrough();
const txsSchema = z
  .object({
    items: z.array(
      z
        .object({
          hash,
          from: addrObj,
          to: addrObj.nullish(),
          value: z.string().nullish(),
          timestamp: z.string().nullish(),
          block_number: z.number().nullish(),
          block: z.number().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const impls = (
  list: Array<{ address?: string | null; address_hash?: string | null }> | null | undefined,
) => (list ?? []).map((i) => (i.address_hash ?? i.address ?? "").toLowerCase()).filter(Boolean);

export class BlockscoutExplorerProvider implements ExplorerProvider {
  readonly name = "blockscout";
  private readonly base: string;

  constructor(
    private readonly chain: ChainConfig,
    private readonly apiKey?: string,
  ) {
    // PRO API (keyed) is reachable from servers; the public instance sits behind a
    // Cloudflare browser challenge which we deliberately do not attempt to bypass.
    this.base = apiKey
      ? `https://api.blockscout.com/${chain.id}/api/v2`
      : `${chain.explorerUrl}/api/v2`;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  explorerUrl() {
    return this.chain.explorerUrl;
  }

  private url(path: string, query: Record<string, string> = {}) {
    const u = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    if (this.apiKey) u.searchParams.set("apikey", this.apiKey);
    return u.toString();
  }

  private async get<T>(
    path: string,
    schema: z.ZodType<T>,
    query?: Record<string, string>,
  ): Promise<T | null> {
    const json = await fetchJson(this.name, this.url(path, query), {
      allowNotFound: true,
      timeoutMs: 12_000,
      retries: 1,
    });
    if (json === null) return null;
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      throw new ProviderError(this.name, "invalid-response", `unexpected shape for ${path}`, {
        retryable: false,
      });
    return parsed.data;
  }

  async getAddressInfo(address: string): Promise<ExplorerAddressInfo | null> {
    const a = await this.get(`/addresses/${address}`, addressSchema);
    if (!a) return null;
    return {
      isContract: a.is_contract ?? null,
      isVerified: a.is_verified ?? null,
      creator: a.creator_address_hash?.toLowerCase() ?? null,
      creationTxHash: (a.creation_transaction_hash ?? a.creation_tx_hash)?.toLowerCase() ?? null,
      name: a.name ?? null,
      proxyType: a.proxy_type ?? null,
      implementations: impls(a.implementations),
    };
  }

  async getContractSource(address: string): Promise<ExplorerContractSource | null> {
    const c = await this.get(`/smart-contracts/${address}`, smartContractSchema);
    if (!c) return null;
    return {
      verified: !!c.is_verified,
      name: c.name ?? null,
      compiler: c.compiler_version ?? null,
      sourceCode: c.source_code ?? null,
      abi: c.abi ?? null,
      deployedBytecode: c.deployed_bytecode ?? null,
      proxyType: c.proxy_type ?? null,
      implementations: impls(c.implementations),
    };
  }

  async getTokenHoldersCount(address: string): Promise<number | null> {
    const t = await this.get(`/tokens/${address}`, tokenSchema);
    const raw = t?.holders_count ?? t?.holders;
    const n = raw === undefined || raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  async getTokenHolders(address: string, limit: number): Promise<ExplorerHolder[]> {
    const h = await this.get(`/tokens/${address}/holders`, holdersSchema);
    return (h?.items ?? []).slice(0, limit).map((i) => ({
      address: i.address.hash.toLowerCase(),
      valueRaw: BigInt(i.value),
      isContract: i.address.is_contract ?? null,
      name: i.address.name ?? null,
    }));
  }

  async getFirstIncomingTransactions(address: string, limit: number): Promise<ExplorerTx[]> {
    const t = await this.get(`/addresses/${address}/transactions`, txsSchema, {
      filter: "to",
      sort: "asc",
    });
    return (t?.items ?? []).slice(0, limit).map((i) => ({
      hash: i.hash.toLowerCase(),
      from: i.from.hash.toLowerCase(),
      to: i.to?.hash.toLowerCase() ?? null,
      valueWei: BigInt(i.value ?? "0"),
      timestamp: i.timestamp ?? null,
      blockNumber: i.block_number ?? i.block ?? null,
    }));
  }
}
