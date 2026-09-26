import type { ChainConfig } from "@quvr/shared";

export type Hex = `0x${string}`;
export type BlockTag = "latest" | number;

export type RpcLog = {
  address: string;
  topics: string[];
  data: Hex;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  blockTimestamp: number | null;
};

export type LogFilter = {
  address?: string | string[];
  topics?: Array<string | string[] | null>;
  fromBlock: number;
  toBlock: number | "latest";
};

export type TxReceipt = {
  transactionHash: string;
  from: string;
  to: string | null;
  contractAddress: string | null;
  status: "success" | "reverted";
  blockNumber: number;
  logs: RpcLog[];
};

export type Tx = {
  hash: string;
  from: string;
  to: string | null;
  input: Hex;
  value: bigint;
  blockNumber: number | null;
  blockTimestamp: number | null;
};

export type CallRequest = { to: string; data: Hex; from?: string; value?: bigint };
export type StateOverride = Record<
  string,
  { balance?: Hex; code?: Hex; stateDiff?: Record<string, Hex> }
>;
export type CallOutcome =
  { ok: true; data: Hex } | { ok: false; reason: string; revertData: string | null };

export type PaginatedLogs = {
  logs: RpcLog[];
  complete: boolean;
  scannedFrom: number;
  scannedTo: number;
};

/** Read-only chain access. There is intentionally no method that sends transactions. */
export interface ChainProvider {
  readonly name: string;
  readonly chain: ChainConfig;
  getBlockNumber(): Promise<number>;
  getBlockTimestamp(block: number): Promise<number>;
  getCode(address: string, block?: BlockTag): Promise<Hex>;
  getStorageAt(address: string, slot: Hex, block?: BlockTag): Promise<Hex>;
  getBalance(address: string): Promise<bigint>;
  getTransactionCount(address: string): Promise<number>;
  /** eth_call; throws CallRevertedError on revert. */
  call(req: CallRequest, block?: BlockTag, stateOverride?: StateOverride): Promise<Hex>;
  /** Many eth_calls in one JSON-RPC batch; reverts are returned, not thrown. */
  callMany(reqs: CallRequest[], block?: BlockTag): Promise<CallOutcome[]>;
  getLogs(filter: LogFilter): Promise<RpcLog[]>;
  /** Splits the range adaptively around the provider's per-query limit. */
  getLogsPaginated(
    filter: LogFilter,
    opts?: { maxLogs?: number; maxRequests?: number; initialWindow?: number },
  ): Promise<PaginatedLogs>;
  getTransaction(hash: string): Promise<Tx | null>;
  getTransactionReceipt(hash: string): Promise<TxReceipt | null>;
  /** Many receipts in one JSON-RPC batch; null where unavailable. */
  getReceipts(hashes: string[]): Promise<Array<TxReceipt | null>>;
  /** eth_getCode for many addresses in one batch; null where the call failed. */
  getCodes(addresses: string[]): Promise<Array<Hex | null>>;
  /** eth_getTransactionCount for many addresses in one batch; null where the call failed. */
  getNonces(addresses: string[]): Promise<Array<number | null>>;
}
