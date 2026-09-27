import hre from "hardhat";
import { writeFileSync } from "node:fs";
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


async function main() {
 const {pub,oracle,meme,quote,swap,hook,trader}=await deploy();
 const labelTx=await oracle.write.publish([meme.address,label(Level.High)]);
 const initial=await meme.read.balanceOf([trader.account.address]);
 let blocked=false;
 try {await swap(true);} catch(e) {
   const serialized=JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v);
   if(!serialized.includes(NOT_ACK)) throw e;
   blocked=true;
 }
 if(!blocked) throw new Error('Expected buy to be blocked');
 const unchanged=await meme.read.balanceOf([trader.account.address]);
 if(unchanged!==initial) throw new Error('Blocked swap changed balance');
 const buy=await swap(true,ACK);
 const buyReceipt=await pub.waitForTransactionReceipt({hash:buy});
 const afterBuy=await meme.read.balanceOf([trader.account.address]);
 if(buyReceipt.status!=='success'||afterBuy<=initial) throw new Error('Buy failed');
 const sell=await swap(false);
 const sellReceipt=await pub.waitForTransactionReceipt({hash:sell});
 const afterSell=await meme.read.balanceOf([trader.account.address]);
 if(sellReceipt.status!=='success'||afterSell>=afterBuy) throw new Error('Sell failed');
 const events=await hook.getEvents.HighRiskBuyAcknowledged({}, { fromBlock: buyReceipt.blockNumber, toBlock: buyReceipt.blockNumber });
 if(events.length!==1) throw new Error('Wrong acknowledgement event count');
 const result={environment:'Local Hardhat EVM',chainId:31337,recordedAt:new Date().toISOString(),pool:'Uniswap v4 PoolManager',tokens:{meme:meme.address,quote:quote.address},hook:hook.address,oracle:oracle.address,labelTx,blocked:{status:'reverted',error:'HighRiskNotAcknowledged',balanceUnchanged:initial===unchanged},buy:{status:buyReceipt.status,hash:buy,block:buyReceipt.blockNumber.toString(),received:(afterBuy-initial).toString()},sell:{status:sellReceipt.status,hash:sell,block:sellReceipt.blockNumber.toString(),acknowledgement:false},ackEvents:events.length};
 writeFileSync('C:/rabota/demo/v2/assets/hook-proof.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});

