import type { ChainConfig } from "@quvr/shared";
import { CallRevertedError, ProviderError } from "../errors";
import { allowHost, assertAllowedUrl } from "../http";
import { withResilience } from "../resilience";
import type {
  BlockTag,
  CallOutcome,
  CallRequest,
  ChainProvider,
  Hex,
  LogFilter,
  PaginatedLogs,
  RpcLog,
  StateOverride,
  Tx,
  TxReceipt,
} from "./types";

type RpcErrorBody = { code: number; message: string; data?: unknown };
type RpcResponse = { id: number; result?: unknown; error?: RpcErrorBody };

const hexToNum = (h: unknown): number => (typeof h === "string" ? Number.parseInt(h, 16) : NaN);
const toHexBlock = (b: BlockTag | undefined) =>
  b === undefined || b === "latest" ? "latest" : `0x${b.toString(16)}`;

function isRevert(err: RpcErrorBody): boolean {
  return err.code === 3 || /revert/i.test(err.message);
}
function isRangeTooLarge(message: string): boolean {
  return /exceeds limit|too many|range|timed out|query returned more than|limit exceeded/i.test(
    message,
  );
}

function parseLog(l: Record<string, unknown>): RpcLog {
  return {
    address: String(l.address).toLowerCase(),
    topics: (l.topics as string[]).map((t) => t.toLowerCase()),
    data: l.data as Hex,
    blockNumber: hexToNum(l.blockNumber),
    transactionHash: String(l.transactionHash).toLowerCase(),
    logIndex: hexToNum(l.logIndex),
    // Nitro may return blockTimestamp "0x0" on logs — treat as unknown.
    blockTimestamp:
      l.blockTimestamp && hexToNum(l.blockTimestamp) > 0 ? hexToNum(l.blockTimestamp) : null,
  };
}

export type RpcProviderOptions = {
  chain: ChainConfig;
  url: string;
  /** Metrics/circuit key: "rpc" (public) or "alchemy". */
  sourceName: string;
};

const RATE_LIMIT_RE = /rate limit|too many requests/i;

export class RpcChainProvider implements ChainProvider {
  readonly name: string;
  readonly chain: ChainConfig;
  private readonly url: string;
  private id = 1;
  private readonly tsCache = new Map<number, number>();

  constructor(opts: RpcProviderOptions) {
    this.chain = opts.chain;
    this.url = opts.url;
    this.name = opts.sourceName;
    allowHost(opts.url);
    assertAllowedUrl(this.name, opts.url);
  }

  private async post(body: unknown, timeoutMs: number, limiterKey?: string): Promise<unknown> {
    return withResilience(
      this.name,
      async (signal) => {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(body),
          signal,
          redirect: "error",
          cache: "no-store",
        });
        if (res.status === 429)
          throw new ProviderError(this.name, "rate-limited", "RPC rate limited", { status: 429 });
        if (!res.ok) {
          throw new ProviderError(this.name, "http", `RPC HTTP ${res.status}`, {
            status: res.status,
            retryable: res.status >= 500,
          });
        }
        const json = (await res.json()) as unknown;
        // Some public RPCs (mainnet.base.org) report throttling as a JSON-RPC error with HTTP 200.
        const items = Array.isArray(json) ? json : [json];
        if (items.some((x) => RATE_LIMIT_RE.test((x as RpcResponse | null)?.error?.message ?? "")))
          throw new ProviderError(this.name, "rate-limited", "RPC rate limited (json-rpc error)", {
            status: 429,
          });
        return json;
      },
      { timeoutMs, retries: 2, limiterKey },
    );
  }

  async request<T>(method: string, params: unknown[], timeoutMs = 12_000): Promise<T> {
    // eth_getLogs is metered much more strictly than other methods by the public RPC.
    const limiterKey = method === "eth_getLogs" ? `${this.name}-logs` : undefined;
    const json = (await this.post(
      { jsonrpc: "2.0", id: this.id++, method, params },
      timeoutMs,
      limiterKey,
    )) as RpcResponse;
    if (json.error) {
      if (method === "eth_call" && isRevert(json.error)) {
        throw new CallRevertedError(
          json.error.message,
          typeof json.error.data === "string" ? json.error.data : null,
        );
      }
      throw new ProviderError(this.name, "rpc", `${method}: ${json.error.message}`, {
        retryable: false,
      });
    }
    return json.result as T;
  }

  getBlockNumber() {
    return this.request<string>("eth_blockNumber", []).then(hexToNum);
  }

  async getBlockTimestamp(block: number): Promise<number> {
    const cached = this.tsCache.get(block);
    if (cached) return cached;
    const b = await this.request<{ timestamp: string } | null>("eth_getBlockByNumber", [
      toHexBlock(block),
      false,
    ]);
    if (!b)
      throw new ProviderError(this.name, "not-found", `block ${block} not found`, {
        retryable: false,
      });
    const ts = hexToNum(b.timestamp);
    if (this.tsCache.size > 5_000) this.tsCache.clear();
    this.tsCache.set(block, ts);
    return ts;
  }

  getCode(address: string, block?: BlockTag) {
    return this.request<Hex>("eth_getCode", [address, toHexBlock(block)]);
  }

  getStorageAt(address: string, slot: Hex, block?: BlockTag) {
    return this.request<Hex>("eth_getStorageAt", [address, slot, toHexBlock(block)]);
  }

  getBalance(address: string) {
    return this.request<string>("eth_getBalance", [address, "latest"]).then((h) => BigInt(h));
  }

  getTransactionCount(address: string) {
    return this.request<string>("eth_getTransactionCount", [address, "latest"]).then(hexToNum);
  }

  private callObject(req: CallRequest) {
    return {
      to: req.to,
      data: req.data,
      ...(req.from ? { from: req.from } : {}),
      ...(req.value !== undefined ? { value: `0x${req.value.toString(16)}` } : {}),
    };
  }

  call(req: CallRequest, block?: BlockTag, stateOverride?: StateOverride) {
    const params: unknown[] = [this.callObject(req), toHexBlock(block)];
    if (stateOverride) params.push(stateOverride);
    return this.request<Hex>("eth_call", params);
  }

  async callMany(reqs: CallRequest[], block?: BlockTag): Promise<CallOutcome[]> {
    const out: CallOutcome[] = [];
    const CHUNK = 25;
    for (let i = 0; i < reqs.length; i += CHUNK) {
      const chunk = reqs.slice(i, i + CHUNK);
      const baseId = this.id;
      this.id += chunk.length;
      const body = chunk.map((r, j) => ({
        jsonrpc: "2.0",
        id: baseId + j,
        method: "eth_call",
        params: [this.callObject(r), toHexBlock(block)],
      }));
      const res = (await this.post(body, 15_000)) as RpcResponse[] | RpcResponse;
      if (!Array.isArray(res)) {
        // Provider does not support batching — fall back to sequential calls.
        for (const r of chunk) {
          try {
            out.push({ ok: true, data: await this.call(r, block) });
          } catch (e) {
            if (e instanceof CallRevertedError)
              out.push({ ok: false, reason: e.message, revertData: e.data });
            else throw e;
          }
        }
        continue;
      }
      const byId = new Map(res.map((r) => [r.id, r]));
      chunk.forEach((_, j) => {
        const r = byId.get(baseId + j);
        if (!r) out.push({ ok: false, reason: "missing batch response", revertData: null });
        else if (r.error) {
          if (!isRevert(r.error)) {
            throw new ProviderError(this.name, "rpc", `eth_call: ${r.error.message}`, {
              retryable: false,
            });
          }
          out.push({
            ok: false,
            reason: r.error.message,
            revertData: typeof r.error.data === "string" ? r.error.data : null,
          });
        } else out.push({ ok: true, data: r.result as Hex });
      });
    }
    return out;
  }

  async getLogs(filter: LogFilter): Promise<RpcLog[]> {
    const raw = await this.request<Array<Record<string, unknown>>>(
      "eth_getLogs",
      [
        {
          ...(filter.address ? { address: filter.address } : {}),
          ...(filter.topics ? { topics: filter.topics } : {}),
          fromBlock: toHexBlock(filter.fromBlock),
          toBlock: toHexBlock(filter.toBlock),
        },
      ],
      25_000,
    );
    return raw.map(parseLog);
  }

  /**
   * Forward scan with an adaptive window: the window shrinks on "too many results" and
   * grows toward ~TARGET logs per request after successes. Logs always cover the
   * contiguous range [fromBlock, scannedTo].
   */
  async getLogsPaginated(
    filter: LogFilter,
    opts: { maxLogs?: number; maxRequests?: number; initialWindow?: number } = {},
  ): Promise<PaginatedLogs> {
    const TARGET = 6_000;
    const maxLogs = opts.maxLogs ?? 50_000;
    const maxRequests = opts.maxRequests ?? 60;
    const to = filter.toBlock === "latest" ? await this.getBlockNumber() : filter.toBlock;
    const logs: RpcLog[] = [];
    let cursor = filter.fromBlock;
    let window = Math.max(1, Math.min(opts.initialWindow ?? to - cursor + 1, to - cursor + 1));
    let requests = 0;
    while (cursor <= to) {
      if (requests >= maxRequests || logs.length >= maxLogs) {
        logs.sort((x, y) => x.blockNumber - y.blockNumber || x.logIndex - y.logIndex);
        return { logs, complete: false, scannedFrom: filter.fromBlock, scannedTo: cursor - 1 };
      }
      const end = Math.min(to, cursor + window - 1);
      requests++;
      try {
        const chunk = await this.getLogs({ ...filter, fromBlock: cursor, toBlock: end });
        logs.push(...chunk);
        cursor = end + 1;
        const grow = chunk.length === 0 ? 4 : Math.min(4, TARGET / chunk.length);
        window = Math.max(1, Math.floor(window * grow));
      } catch (e) {
        if (
          e instanceof ProviderError &&
          e.kind === "rpc" &&
          isRangeTooLarge(e.message) &&
          end > cursor
        ) {
          window = Math.max(1, Math.floor((end - cursor + 1) / 4));
          continue;
        }
        // Keep what we already have: callers resume from scannedTo instead of starting over.
        if (cursor > filter.fromBlock) {
          logs.sort((x, y) => x.blockNumber - y.blockNumber || x.logIndex - y.logIndex);
          return { logs, complete: false, scannedFrom: filter.fromBlock, scannedTo: cursor - 1 };
        }
        throw e;
      }
    }
    logs.sort((x, y) => x.blockNumber - y.blockNumber || x.logIndex - y.logIndex);
    return { logs, complete: true, scannedFrom: filter.fromBlock, scannedTo: to };
  }

  /** Generic JSON-RPC batch; per-item errors become null. Falls back to sequential calls. */
  private async batchRequest<T>(method: string, paramsList: unknown[][]): Promise<Array<T | null>> {
    const out: Array<T | null> = [];
    const CHUNK = 25;
    for (let i = 0; i < paramsList.length; i += CHUNK) {
      const chunk = paramsList.slice(i, i + CHUNK);
      const baseId = this.id;
      this.id += chunk.length;
      const res = (await this.post(
        chunk.map((params, j) => ({ jsonrpc: "2.0", id: baseId + j, method, params })),
        15_000,
      )) as RpcResponse[] | RpcResponse;
      if (!Array.isArray(res)) {
        for (const params of chunk) {
          try {
            out.push(await this.request<T>(method, params));
          } catch {
            out.push(null);
          }
        }
        continue;
      }
      const byId = new Map(res.map((r) => [r.id, r]));
      chunk.forEach((_, j) => {
        const r = byId.get(baseId + j);
        out.push(r && !r.error ? (r.result as T) : null);
      });
    }
    return out;
  }

  async getReceipts(hashes: string[]): Promise<Array<TxReceipt | null>> {
    const raw = await this.batchRequest<Record<string, unknown>>(
      "eth_getTransactionReceipt",
      hashes.map((h) => [h]),
    );
    return raw.map((r) => (r ? parseReceipt(r) : null));
  }

  getCodes(addresses: string[]) {
    return this.batchRequest<Hex>(
      "eth_getCode",
      addresses.map((a) => [a, "latest"]),
    );
  }

  async getNonces(addresses: string[]) {
    const res = await this.batchRequest<string>(
      "eth_getTransactionCount",
      addresses.map((a) => [a, "latest"]),
    );
    return res.map((h) => (h === null ? null : hexToNum(h)));
  }

  async getTransaction(hash: string): Promise<Tx | null> {
    const t = await this.request<Record<string, string> | null>("eth_getTransactionByHash", [hash]);
    if (!t) return null;
    return {
      hash: t.hash!.toLowerCase(),
      from: t.from!.toLowerCase(),
      to: t.to ? t.to.toLowerCase() : null,
      input: t.input as Hex,
      value: BigInt(t.value ?? "0x0"),
      blockNumber: t.blockNumber ? hexToNum(t.blockNumber) : null,
      blockTimestamp: t.blockTimestamp ? hexToNum(t.blockTimestamp) : null,
    };
  }

  async getTransactionReceipt(hash: string): Promise<TxReceipt | null> {
    const r = await this.request<Record<string, unknown> | null>("eth_getTransactionReceipt", [
      hash,
    ]);
    return r ? parseReceipt(r) : null;
  }
}

function parseReceipt(r: Record<string, unknown>): TxReceipt {
  return {
    transactionHash: String(r.transactionHash).toLowerCase(),
    from: String(r.from).toLowerCase(),
    to: r.to ? String(r.to).toLowerCase() : null,
    contractAddress: r.contractAddress ? String(r.contractAddress).toLowerCase() : null,
    status: r.status === "0x1" ? "success" : "reverted",
    blockNumber: hexToNum(r.blockNumber),
    logs: (r.logs as Array<Record<string, unknown>>).map(parseLog),
  };
}
