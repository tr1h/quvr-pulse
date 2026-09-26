import type { ChainProvider } from "@quvr/providers";
import { APPROX_BLOCKS_PER_SECOND } from "@quvr/shared";

/**
 * Block ↔ time mapping from two measured reference points (head and head−1M).
 * Used where logs lack blockTimestamp; values derived this way are approximate.
 */
export class ChainClock {
  private constructor(
    readonly headBlock: number,
    readonly headTs: number,
    readonly blocksPerSecond: number,
  ) {}

  static async create(chain: ChainProvider): Promise<ChainClock> {
    const head = await chain.getBlockNumber();
    const headTs = await chain.getBlockTimestamp(head);
    let bps = APPROX_BLOCKS_PER_SECOND;
    try {
      const ref = Math.max(1, head - 1_000_000);
      const refTs = await chain.getBlockTimestamp(ref);
      if (headTs > refTs) bps = (head - ref) / (headTs - refTs);
    } catch {
      /* keep default */
    }
    return new ChainClock(head, headTs, bps);
  }

  blockAt(tsSec: number): number {
    return Math.max(
      0,
      Math.min(
        this.headBlock,
        Math.round(this.headBlock - (this.headTs - tsSec) * this.blocksPerSecond),
      ),
    );
  }

  tsAt(block: number): number {
    return Math.round(this.headTs - (this.headBlock - block) / this.blocksPerSecond);
  }

  isoAt(block: number): string {
    return new Date(this.tsAt(block) * 1000).toISOString();
  }
}
