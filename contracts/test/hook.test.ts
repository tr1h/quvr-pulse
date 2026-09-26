import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import {
  encodeAbiParameters,
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
 * QuvrRiskHook against Uniswap v4's real PoolManager: a pool with the hook, real liquidity and
 * real swaps. Buying a High-risk token needs the ACK; selling never does.
 */
const Level = { Low: 1, Elevated: 2, High: 3, Insufficient: 4 } as const;
const BEFORE_SWAP_FLAG = 1n << 7n;
const ALL_HOOK_MASK = (1n << 14n) - 1n;
const MIN_PRICE_LIMIT = 4295128739n + 1n;
const MAX_PRICE_LIMIT = 1461446703485210103287273052203988822378723970342n - 1n;
const MAX_AGE = 3n * 86_400n;
const ACK = keccak256(toHex("QUVR_RISK_ACKNOWLEDGED"));
const NOT_ACK = toFunctionSelector("HighRiskNotAcknowledged(address)").slice(2);

const label = (level: number) => ({
  level,
  contractScore: 40,
  liquidityScore: 40,
  distributionScore: 255,
  flags: 0,
  reportHash: zeroHash,
});

/** Mines a CREATE2 salt so the hook address carries exactly the beforeSwap permission bit. */
function mineSalt(deployer: Address, initCode: Hex): Hex {
  const codeHash = keccak256(initCode).slice(2);
  for (let i = 0n; i < 1_000_000n; i++) {
    const salt = toHex(i, { size: 32 });
    const addr = BigInt(
      `0x${keccak256(`0xff${deployer.slice(2)}${salt.slice(2)}${codeHash}` as Hex).slice(-40)}`,
    );
    if ((addr & ALL_HOOK_MASK) === BEFORE_SWAP_FLAG) return salt;
  }
  throw new Error("no salt found");
}

async function deploy() {
  const [owner, trader] = await hre.viem.getWalletClients();
  const pub = await hre.viem.getPublicClient();
  const manager = await hre.viem.deployContract("PoolManager", [owner.account.address]);
  const oracle = await hre.viem.deployContract("QuvrRiskOracle", [
    owner.account.address,
    owner.account.address,
  ]);
  const factory = await hre.viem.deployContract("Create2Deployer");
  const artifact = await hre.artifacts.readArtifact("QuvrRiskHook");
  const initCode = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args: [manager.address, oracle.address, MAX_AGE],
  });
  const salt = mineSalt(factory.address, initCode);
  await factory.write.deploy([salt, initCode]);
  const hookAddr = await factory.read.computeAddress([salt, keccak256(initCode)]);
  const hook = await hre.viem.getContractAt("QuvrRiskHook", hookAddr);

  // Two tokens: a "meme" that may get labelled and a quote token.
  const meme = await hre.viem.deployContract("TestToken", ["Meme", "MEME"]);
  const quote = await hre.viem.deployContract("TestToken", ["Quote", "USDQ"]);
  const [c0, c1] =
    BigInt(meme.address) < BigInt(quote.address)
      ? [meme.address, quote.address]
      : [quote.address, meme.address];
  const key = { currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: hookAddr };
  await manager.write.initialize([key, 1n << 96n]);

  const lpRouter = await hre.viem.deployContract("PoolModifyLiquidityTest", [manager.address]);
  const swapRouter = await hre.viem.deployContract("PoolSwapTest", [manager.address]);
  for (const t of [meme, quote]) {
    for (const who of [owner, trader]) await t.write.mint([who.account.address, parseEther("1000")]);
    await t.write.approve([lpRouter.address, maxUint256]);
    await t.write.approve([swapRouter.address, maxUint256]);
    const asTrader = await hre.viem.getContractAt("TestToken", t.address, {
      client: { wallet: trader },
    });
    await asTrader.write.approve([swapRouter.address, maxUint256]);
  }
  await lpRouter.write.modifyLiquidity([
    key,
    { tickLower: -600, tickUpper: 600, liquidityDelta: parseEther("100"), salt: zeroHash },
    "0x",
  ]);
  const traderSwap = await hre.viem.getContractAt("PoolSwapTest", swapRouter.address, {
    client: { wallet: trader },
  });

  /** Swaps 0.1 of the input token; `buyMeme` picks the direction. */
  const swap = (buyMeme: boolean, hookData: Hex = "0x") => {
    const memeIs0 = getAddress(c0) === getAddress(meme.address);
    const zeroForOne = buyMeme ? !memeIs0 : memeIs0;
    return traderSwap.write.swap([
      key,
      {
        zeroForOne,
        amountSpecified: -parseEther("0.1"),
        sqrtPriceLimitX96: zeroForOne ? MIN_PRICE_LIMIT : MAX_PRICE_LIMIT,
      },
      { takeClaims: false, settleUsingBurn: false },
      hookData,
    ]);
  };
  return { pub, oracle, hook, hookAddr, meme, quote, swap, trader };
}

async function expectBlocked(p: Promise<unknown>) {
  let err: unknown = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, "swap should revert").to.not.equal(null);
  // PoolManager wraps hook errors; the hook's selector is inside the revert data.
  expect(JSON.stringify(err, (_, v) => (typeof v === "bigint" ? v.toString() : v))).to.include(
    NOT_ACK,
  );
}

describe("QuvrRiskHook (Uniswap v4)", () => {
  it("is deployed at an address that encodes only the beforeSwap permission", async () => {
    const { hookAddr, hook } = await loadFixture(deploy);
    expect(BigInt(hookAddr) & ALL_HOOK_MASK).to.equal(BEFORE_SWAP_FLAG);
    expect(await hook.read.ACK()).to.equal(ACK);
  });

  it("does nothing for tokens without a label", async () => {
    const { swap, hook, meme } = await loadFixture(deploy);
    expect(await hook.read.requiresAcknowledgement([meme.address])).to.equal(false);
    await swap(true);
    await swap(false);
  });

  it("blocks buying a High-risk token without acknowledgement", async () => {
    const { oracle, meme, swap, hook } = await loadFixture(deploy);
    await oracle.write.publish([meme.address, label(Level.High)]);
    expect(await hook.read.requiresAcknowledgement([meme.address])).to.equal(true);
    await expectBlocked(swap(true));
    await expectBlocked(swap(true, keccak256(toHex("something else"))));
  });

  it("allows the buy with the acknowledgement and logs it", async () => {
    const { oracle, meme, swap, hook, trader } = await loadFixture(deploy);
    await oracle.write.publish([meme.address, label(Level.High)]);
    await swap(true, ACK);
    const ev = await hook.getEvents.HighRiskBuyAcknowledged();
    expect(ev).to.have.length(1);
    expect(getAddress(ev[0]!.args.token!)).to.equal(getAddress(meme.address));
    void trader;
  });

  it("never blocks selling a High-risk token (nobody gets trapped)", async () => {
    const { oracle, meme, swap } = await loadFixture(deploy);
    await oracle.write.publish([meme.address, label(Level.High)]);
    await swap(false);
  });

  it("does not restrict Low, Elevated or Insufficient labels", async () => {
    const { oracle, meme, swap } = await loadFixture(deploy);
    for (const level of [Level.Low, Level.Elevated, Level.Insufficient]) {
      await oracle.write.publish([meme.address, label(level)]);
      await swap(true);
    }
  });

  it("ignores stale labels (older than maxAge)", async () => {
    const { oracle, meme, swap } = await loadFixture(deploy);
    await oracle.write.publish([meme.address, label(Level.High)]);
    await time.increase(Number(MAX_AGE) + 1);
    await swap(true);
  });

  it("follows the oracle when the label changes", async () => {
    const { oracle, meme, swap } = await loadFixture(deploy);
    await oracle.write.publish([meme.address, label(Level.High)]);
    await expectBlocked(swap(true));
    await oracle.write.publish([meme.address, label(Level.Low)]);
    await swap(true);
  });

  it("never asks about native ETH", async () => {
    const { hook } = await loadFixture(deploy);
    expect(
      await hook.read.requiresAcknowledgement(["0x0000000000000000000000000000000000000000"]),
    ).to.equal(false);
  });
});

void encodeAbiParameters;
