import { expect } from "chai";
import hre from "hardhat";
import {
  encodeDeployData,
  getAddress,
  keccak256,
  maxUint256,
  parseEther,
  toFunctionSelector,
  toHex,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

/**
 * Fork test (run explicitly): the hook against the LIVE Robinhood Chain PoolManager and our
 * deployed QuvrRiskOracle v2, on a local copy of mainnet state.
 *   FORK=1 npx hardhat test test/fork.robinhood.ts
 */
const POOL_MANAGER = getAddress("0x8366a39cc670b4001a1121b8f6a443a643e40951");
const ORACLE = getAddress("0x9c9b26441809625619512cdc106308d09030e365");
const PUBLISHER = getAddress("0x134C193EB4344c912DA558eCA806bb364dC2a8B1");
const MAX_AGE = 3n * 86_400n;
const ACK = keccak256(toHex("QUVR_RISK_ACKNOWLEDGED"));
const NOT_ACK = toFunctionSelector("HighRiskNotAcknowledged(address)").slice(2);
const FLAG = 1n << 7n;
const MASK = (1n << 14n) - 1n;

function mineSalt(deployer: Address, initCode: Hex): Hex {
  const h = keccak256(initCode).slice(2);
  for (let i = 0n; ; i++) {
    const salt = toHex(i, { size: 32 });
    const a = BigInt(`0x${keccak256(`0xff${deployer.slice(2)}${salt.slice(2)}${h}` as Hex).slice(-40)}`);
    if ((a & MASK) === FLAG) return salt;
  }
}

(process.env.FORK ? describe : describe.skip)("QuvrRiskHook on a Robinhood Chain fork", function () {
  this.timeout(600_000);

  it("works with the live PoolManager and the deployed oracle", async () => {
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: "https://rpc.mainnet.chain.robinhood.com" } }],
    });
    const [me] = await hre.viem.getWalletClients();
    const pub = await hre.viem.getPublicClient();
    expect(((await pub.getCode({ address: POOL_MANAGER })) ?? "0x").length).to.be.greaterThan(1000);

    const factory = await hre.viem.deployContract("Create2Deployer");
    const art = await hre.artifacts.readArtifact("QuvrRiskHook");
    const initCode = encodeDeployData({
      abi: art.abi,
      bytecode: art.bytecode as Hex,
      args: [POOL_MANAGER, ORACLE, MAX_AGE],
    });
    const salt = mineSalt(factory.address, initCode);
    await factory.write.deploy([salt, initCode]);
    const hookAddr = await factory.read.computeAddress([salt, keccak256(initCode)]);

    const meme = await hre.viem.deployContract("TestToken", ["Meme", "MEME"]);
    const quote = await hre.viem.deployContract("TestToken", ["Quote", "USDQ"]);
    const [c0, c1] =
      BigInt(meme.address) < BigInt(quote.address)
        ? [meme.address, quote.address]
        : [quote.address, meme.address];
    const key = { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: hookAddr };
    const manager = await hre.viem.getContractAt("PoolManager", POOL_MANAGER);
    await manager.write.initialize([key, 1n << 96n]);
    const lp = await hre.viem.deployContract("PoolModifyLiquidityTest", [POOL_MANAGER]);
    const router = await hre.viem.deployContract("PoolSwapTest", [POOL_MANAGER]);
    for (const t of [meme, quote]) {
      await t.write.mint([me.account.address, parseEther("1000")]);
      await t.write.approve([lp.address, maxUint256]);
      await t.write.approve([router.address, maxUint256]);
    }
    await lp.write.modifyLiquidity([
      key,
      { tickLower: -600, tickUpper: 600, liquidityDelta: parseEther("100"), salt: zeroHash },
      "0x",
    ]);
    const memeIs0 = getAddress(c0) === getAddress(meme.address);
    const buy = (hookData: Hex) =>
      router.write.swap([
        key,
        {
          zeroForOne: !memeIs0,
          amountSpecified: -parseEther("0.1"),
          sqrtPriceLimitX96: !memeIs0 ? 4295128740n : 1461446703485210103287273052203988822378723970341n,
        },
        { takeClaims: false, settleUsingBurn: false },
        hookData,
      ]);

    // Unlabelled: normal swap through the live PoolManager.
    await buy("0x");

    // Label it High from the real publisher account on the fork, then the hook must block.
    await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [PUBLISHER] });
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [PUBLISHER, "0x16345785D8A0000"],
    });
    const oracle = await hre.viem.getContractAt("QuvrRiskOracle", ORACLE, {
      client: { wallet: await hre.viem.getWalletClient(PUBLISHER) },
    });
    await oracle.write.publish([
      meme.address,
      { level: 3, contractScore: 40, liquidityScore: 40, distributionScore: 255, flags: 0, reportHash: zeroHash },
    ]);
    let err: unknown = null;
    try {
      await buy("0x");
    } catch (e) {
      err = e;
    }
    expect(JSON.stringify(err, (_, v) => (typeof v === "bigint" ? v.toString() : v))).to.include(NOT_ACK);
    await buy(ACK);
    console.log(`      fork OK: hook ${hookAddr} on live PoolManager ${POOL_MANAGER}`);
  });
});
