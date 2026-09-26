import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, keccak256, toHex, type Address } from "viem";

/**
 * Edge cases and production-like scenarios: overwrites, boundaries, a compromised publisher,
 * ownership mistakes, malformed input, and gas for the batch sizes the server uses.
 */
const Level = { None: 0, Low: 1, Elevated: 2, High: 3, Insufficient: 4 } as const;
const NO_DATA = 255;
const ALL_FLAGS = (1 << 8) - 1;
const tokenN = (i: number) => getAddress(`0x${(i + 1).toString(16).padStart(40, "0")}`);
const label = (over: Record<string, unknown> = {}) => ({
  level: Level.High,
  contractScore: 40,
  liquidityScore: 73,
  distributionScore: NO_DATA,
  flags: 0b11,
  reportHash: keccak256(toHex("report")),
  ...over,
});

async function deploy() {
  const [owner, publisher, attacker, wallet2] = await hre.viem.getWalletClients();
  const pub = await hre.viem.getPublicClient();
  const oracle = await hre.viem.deployContract("QuvrRiskOracle", [
    owner.account.address,
    publisher.account.address,
  ]);
  // The deployment is the only transaction in the latest block at this point.
  const block = await pub.getBlock({ includeTransactions: true });
  const deployTx = await pub.getTransactionReceipt({ hash: block.transactions[0]!.hash });
  const as = async (who: typeof owner) =>
    hre.viem.getContractAt("QuvrRiskOracle", oracle.address, { client: { wallet: who } });
  return {
    pub,
    oracle,
    owner,
    publisher,
    attacker,
    wallet2,
    deployGas: deployTx.gasUsed,
    asPublisher: await as(publisher),
    asAttacker: await as(attacker),
    asWallet2: await as(wallet2),
  };
}

describe("QuvrRiskOracle scenarios", () => {
  it("a newer label replaces the older one and both stay in the event history", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publish([tokenN(0), label({ level: Level.Elevated })]);
    const first = await oracle.read.getAssessment([tokenN(0)]);
    await time.increase(600);
    await asPublisher.write.publish([tokenN(0), label({ level: Level.High, flags: 0 })]);
    const second = await oracle.read.getAssessment([tokenN(0)]);
    expect(second.level).to.equal(Level.High);
    expect(second.flags).to.equal(0);
    expect(second.updatedAt - first.updatedAt).to.be.greaterThanOrEqual(600);
    const history = await oracle.getEvents.AssessmentPublished(
      { token: tokenN(0) },
      { fromBlock: 0n },
    );
    expect(history.map((e) => e.args.level)).to.deep.equal([Level.Elevated, Level.High]);
  });

  it("accepts every boundary value that is valid", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publish([
      tokenN(1),
      label({
        contractScore: 0,
        liquidityScore: 100,
        distributionScore: NO_DATA,
        flags: ALL_FLAGS,
      }),
    ]);
    const a = await oracle.read.getAssessment([tokenN(1)]);
    expect([a.contractScore, a.liquidityScore, a.distributionScore, a.flags]).to.deep.equal([
      0,
      100,
      NO_DATA,
      ALL_FLAGS,
    ]);
    for (const level of [Level.Low, Level.Elevated, Level.High, Level.Insufficient])
      await asPublisher.write.publish([tokenN(2), label({ level })]);
  });

  it("rejects every invalid value (scores 101–254, unknown level, unknown flags)", async () => {
    const { asPublisher } = await loadFixture(deploy);
    for (const s of [101, 150, 254])
      await expect(
        asPublisher.write.publish([tokenN(0), label({ liquidityScore: s })]),
      ).to.be.rejectedWith("InvalidScore");
    await expect(asPublisher.write.publish([tokenN(0), label({ level: 5 })])).to.be.rejected;
    await expect(
      asPublisher.write.publish([tokenN(0), label({ flags: 2 ** 31 })]),
    ).to.be.rejectedWith("UnknownFlags");
  });

  it("one bad label reverts the whole batch (nothing half-written)", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await expect(
      asPublisher.write.publishBatch([
        [tokenN(0), tokenN(1)],
        [label(), label({ contractScore: 200 })],
      ]),
    ).to.be.rejectedWith("InvalidScore");
    expect((await oracle.read.getAssessment([tokenN(0)])).level).to.equal(Level.None);
  });

  it("freshness boundary: a label exactly maxAge old still counts, one second more does not", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publish([tokenN(0), label()]);
    await time.increase(100);
    expect(await oracle.read.isHighRisk([tokenN(0), 100n])).to.deep.equal([true, true]);
    await time.increase(1);
    expect(await oracle.read.isHighRisk([tokenN(0), 100n])).to.deep.equal([false, false]);
    expect(await oracle.read.isHighRisk([tokenN(0), 0n])).to.deep.equal([false, false]);
  });

  it("low and elevated labels are known but not high", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publishBatch([
      [tokenN(0), tokenN(1)],
      [label({ level: Level.Low }), label({ level: Level.Elevated })],
    ]);
    expect(await oracle.read.isHighRisk([tokenN(0), 3600n])).to.deep.equal([true, false]);
    expect(await oracle.read.isHighRisk([tokenN(1), 3600n])).to.deep.equal([true, false]);
  });

  it("compromised publisher: owner revokes it, the attacker can do nothing else", async () => {
    const { oracle, publisher, asAttacker, attacker, asPublisher } = await loadFixture(deploy);
    await expect(asAttacker.write.publish([tokenN(0), label()])).to.be.rejectedWith("NotPublisher");
    await expect(
      asAttacker.write.setPublisher([attacker.account.address, true]),
    ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    await expect(asAttacker.write.transferOwnership([attacker.account.address])).to.be.rejectedWith(
      "OwnableUnauthorizedAccount",
    );
    // A publisher cannot promote itself or anyone else either.
    await expect(
      asPublisher.write.setPublisher([attacker.account.address, true]),
    ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    await oracle.write.setPublisher([publisher.account.address, false]);
    await expect(asPublisher.write.publish([tokenN(0), label()])).to.be.rejectedWith(
      "NotPublisher",
    );
  });

  it("ownership cannot be renounced by mistake, and only the pending owner can accept", async () => {
    const { oracle, asAttacker, wallet2, asWallet2 } = await loadFixture(deploy);
    await expect(oracle.write.renounceOwnership()).to.be.rejectedWith("RenounceDisabled");
    await oracle.write.transferOwnership([wallet2.account.address]);
    await expect(asAttacker.write.acceptOwnership()).to.be.rejectedWith(
      "OwnableUnauthorizedAccount",
    );
    await asWallet2.write.acceptOwnership();
    expect(getAddress(await oracle.read.owner())).to.equal(getAddress(wallet2.account.address));
  });

  it("the contract never holds or accepts ETH", async () => {
    const { oracle, owner, pub } = await loadFixture(deploy);
    await expect(owner.sendTransaction({ to: oracle.address as Address, value: 1n })).to.be
      .rejected;
    expect(await pub.getBalance({ address: oracle.address })).to.equal(0n);
  });

  it("an empty batch is a harmless no-op", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publishBatch([[], []]);
    expect(await oracle.getEvents.AssessmentPublished()).to.have.length(0);
  });

  it("gas: deployment, first write, overwrite and a 20-token batch", async () => {
    const { pub, asPublisher, deployGas } = await loadFixture(deploy);
    const gas = async (hash: `0x${string}`) =>
      (await pub.waitForTransactionReceipt({ hash })).gasUsed;
    const first = await gas(await asPublisher.write.publish([tokenN(0), label()]));
    const again = await gas(
      await asPublisher.write.publish([tokenN(0), label({ level: Level.Low })]),
    );
    const tokens = Array.from({ length: 20 }, (_, i) => tokenN(100 + i));
    const batch = await gas(
      await asPublisher.write.publishBatch([tokens, tokens.map(() => label())]),
    );
    console.log(
      `      gas → deploy ${deployGas}, first label ${first}, overwrite ${again}, batch of 20 ${batch} (${batch / 20n}/label)`,
    );
    expect(Number(batch / 20n)).to.be.lessThan(Number(first));
  });
});
