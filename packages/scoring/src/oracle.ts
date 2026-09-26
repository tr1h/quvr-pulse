import type { RiskLevel, TokenReport } from "@quvr/shared";
import { flagsFromFindings } from "./outcomes";
import type { RugFlagId } from "./rug-report";
import { verdictLevel } from "./verdict";

/**
 * Mapping of a report to the on-chain label of QuvrRiskOracle.sol. Bit positions and level
 * numbers must match the contract (see FLAG_* constants and enum Level there).
 */
export const ORACLE_FLAG_BITS: Record<RugFlagId, number> = {
  "contract-control": 0,
  concentrated: 1,
  "deployer-share": 2,
  "deployer-selling": 3,
  clusters: 4,
  "thin-liquidity": 5,
  "price-impact": 6,
  "mass-transfers": 7,
};

export const ORACLE_LEVEL: Record<RiskLevel, number> = {
  low: 1,
  elevated: 2,
  high: 3,
  insufficient: 4,
};

/** Score value the contract reads as "no data" (never 0). */
export const ORACLE_NO_DATA = 255;

export type OracleLabel = {
  level: number;
  contractScore: number;
  liquidityScore: number;
  distributionScore: number;
  flags: number;
};

const score = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? ORACLE_NO_DATA
    : Math.max(0, Math.min(100, Math.round(v)));

export function oracleLabel(r: TokenReport): OracleLabel {
  const level = verdictLevel([
    r.scores.contractSafety.level,
    r.scores.liquidityHealth.level,
    r.scores.distributionHealth.level,
  ] as RiskLevel[]);
  const flags = flagsFromFindings(r.findings).reduce(
    (acc, f) => acc | (1 << ORACLE_FLAG_BITS[f]),
    0,
  );
  return {
    level: ORACLE_LEVEL[level],
    contractScore: score(r.scores.contractSafety.value),
    liquidityScore: score(r.scores.liquidityHealth.value),
    distributionScore: score(r.scores.distributionHealth.value),
    flags,
  };
}

/**
 * What must change for a label to be re-published early: the level or the red flags. Scores move
 * all the time and are refreshed with the periodic re-publish (gas is spent on meaningful changes).
 */
export function oracleSignature(l: OracleLabel): string {
  return `${l.level}:${l.flags}`;
}

/** Decodes the flags bitmask back to flag ids (for the website). */
export function oracleFlags(mask: number): RugFlagId[] {
  return (Object.keys(ORACLE_FLAG_BITS) as RugFlagId[]).filter(
    (f) => (mask & (1 << ORACLE_FLAG_BITS[f])) !== 0,
  );
}
