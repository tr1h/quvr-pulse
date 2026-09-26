import { TRANSFER_TOPIC, type ExplorerProvider, type ChainProvider } from "@quvr/providers";
import { topicToAddress, type CreationInfo } from "@quvr/shared";

const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Creator detection. Explorer first (when configured); otherwise the first mint
 * (Transfer from 0x0) found via a topic-filtered eth_getLogs — its tx sender is the
 * deployer and its `to` the factory (for launchpad-created tokens).
 */
export async function detectCreation(
  chain: ChainProvider,
  explorer: ExplorerProvider,
  token: string,
  explorerUsable: boolean,
): Promise<CreationInfo | null> {
  if (explorerUsable) {
    try {
      const info = await explorer.getAddressInfo(token);
      if (info?.creator && info.creationTxHash) {
        const tx = await chain.getTransaction(info.creationTxHash);
        const block = tx?.blockNumber ?? null;
        return {
          deployer: tx?.from ?? info.creator,
          factory: tx?.to && tx.to !== token ? tx.to : null,
          txHash: info.creationTxHash,
          blockNumber: block,
          timestamp: tx?.blockTimestamp
            ? new Date(tx.blockTimestamp * 1000).toISOString()
            : block
              ? new Date((await chain.getBlockTimestamp(block)) * 1000).toISOString()
              : null,
          initialMintTo: null,
          method: "explorer",
        };
      }
    } catch {
      /* fall back to RPC */
    }
  }

  const mints = await chain.getLogsPaginated(
    { address: token, topics: [TRANSFER_TOPIC, ZERO_TOPIC], fromBlock: 0, toBlock: "latest" },
    { maxLogs: 20_000, maxRequests: 12 },
  );
  const first = mints.logs[0];
  if (!first) return null;
  const tx = await chain.getTransaction(first.transactionHash);
  const ts =
    first.blockTimestamp ??
    tx?.blockTimestamp ??
    (await chain.getBlockTimestamp(first.blockNumber));
  return {
    deployer: tx?.from ?? null,
    factory: tx?.to && tx.to !== token ? tx.to : null,
    txHash: first.transactionHash,
    blockNumber: first.blockNumber,
    timestamp: ts ? new Date(ts * 1000).toISOString() : null,
    initialMintTo: topicToAddress(first.topics[2] ?? ZERO_TOPIC),
    method: "rpc-mint-log",
  };
}
