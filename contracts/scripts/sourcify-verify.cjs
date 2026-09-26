// Verifies deployed contracts on Sourcify (API v2), which Blockscout reads. Usage:
//   node scripts/sourcify-verify.cjs <address> <sourceName:ContractName> [creationTxHash]
const fs = require("fs");
const path = require("path");
const [address, id, txHash] = process.argv.slice(2);
const [sourceName, contractName] = id.split(":");
const dbg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../artifacts", sourceName, `${contractName}.dbg.json`), "utf8"),
);
const buildInfo = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../artifacts", sourceName, dbg.buildInfo), "utf8"),
);
const body = {
  stdJsonInput: buildInfo.input,
  compilerVersion: buildInfo.solcLongVersion,
  contractIdentifier: `${sourceName}:${contractName}`,
  ...(txHash ? { creationTransactionHash: txHash } : {}),
};
(async () => {
  const res = await fetch(`https://sourcify.dev/server/v2/verify/4663/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(async () => ({ raw: (await res.text()).slice(0, 300) }));
  console.log("submit", res.status, JSON.stringify(j).slice(0, 300));
  if (!j.verificationId) return;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await (await fetch(`https://sourcify.dev/server/v2/verify/${j.verificationId}`)).json();
    if (s.isJobCompleted) {
      console.log("result", JSON.stringify(s.contract ?? s.error ?? s).slice(0, 400));
      return;
    }
  }
  console.log("still pending");
})();
