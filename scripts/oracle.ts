/**
 * Risk Oracle operations, run on the server inside the worker container (the key stays there):
 *   node --import tsx /app/scripts/oracle.ts address   → publisher address + balance (no secrets)
 *   node --import tsx /app/scripts/oracle.ts deploy    → deploys QuvrRiskOracle, prints its address
 *   node --import tsx /app/scripts/oracle.ts publish   → publishes due labels once
 *   node --import tsx /app/scripts/oracle.ts smoke     → local test: deploy + publish a sample label
 */
import { oracleLabel } from "@quvr/scoring";
import {
  deployHook,
  deployOracle,
  oracleBalance,
  oracleInfo,
  ORACLE_ABI,
  publishOracleLabels,
  seedOracleStats,
  reportId,
} from "@quvr/services";
import type { TokenReport } from "@quvr/shared";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const cmd = process.argv[2];

if (cmd === "address") {
  const i = oracleInfo();
  console.log(JSON.stringify({ ...i, balanceEth: await oracleBalance() }, null, 2));
} else if (cmd === "deploy") {
  const r = await deployOracle();
  console.log(JSON.stringify(r, null, 2));
} else if (cmd === "deploy-hook") {
  console.log(JSON.stringify(await deployHook(), null, 2));
} else if (cmd === "seed-stats") {
  console.log(await seedOracleStats(BigInt(process.argv[3] ?? "0")));
} else if (cmd === "publish") {
  console.log(`published ${await publishOracleLabels()} labels`);
} else if (cmd === "smoke") {
  // Local only (Hardhat node with chain id 46630): deploy, publish one label, read it back.
  const { address } = await deployOracle();
  const rpc = process.env.ROBINHOOD_TESTNET_RPC_URL!;
  const key = process.env.ORACLE_PUBLISHER_KEY as `0x${string}`;
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ transport: http(rpc) });
  const wallet = createWalletClient({ account, transport: http(rpc) });
  const report = JSON.parse(
    readFileSync(new URL("../packages/scoring/test/fixtures-rocco.json", import.meta.url), "utf8"),
  ) as TokenReport;
  const label = oracleLabel(report);
  // The fixture is a Solana report; any EVM address works for a local round trip.
  const token = "0x21CFCFc3d8F98fC728f48341D10Ad8283F6EB7AB" as Address;
  const hash = await wallet.writeContract({
    chain: null,
    address,
    abi: ORACLE_ABI,
    functionName: "publishBatch",
    args: [[token], [{ ...label, reportHash: reportId(46630, token, report.generatedAt) }]],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const onChain = await pub.readContract({
    address,
    abi: ORACLE_ABI,
    functionName: "getAssessment",
    args: [token],
  });
  const risk = await pub.readContract({
    address,
    abi: ORACLE_ABI,
    functionName: "isHighRisk",
    args: [token, 3_600n],
  });
  console.log(
    JSON.stringify(
      { address, label, onChain, isHighRisk: risk, gasUsed: receipt.gasUsed },
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
} else {
  console.error(
    "usage: oracle.ts address | deploy | deploy-hook | seed-stats <block> | publish | smoke",
  );
  process.exit(1);
}

// DB/Redis connections keep the event loop alive; this is a one-shot CLI.
process.exit(0);
