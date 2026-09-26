import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, keccak256, toHex, zeroAddress, type Address } from "viem";

const Level = { None: 0, Low: 1, Elevated: 2, High: 3, Insufficient: 4 } as const;
const NO_DATA = 255;
const TOKEN_A = getAddress("0x21cfcfc3d8f98fc728f48341d10ad8283f6eb7ab");
const TOKEN_B = getAddress("0x4b7d1e5ec6889e63e70d39561edf925095dbed88");

const label = (
  over: Partial<{
    level: number;
    contractScore: number;
    liquidityScore: number;
    distributionScore: number;
    flags: number;
    reportHash: `0x${string}`;
  }> = {},
) => ({
  level: Level.High,
  contractScore: 40,
  liquidityScore: 73,
  distributionScore: NO_DATA,
  flags: 0b11,
  reportHash: keccak256(toHex("report")),
  ...over,
});

async function deploy() {
  const [owner, publisher, stranger, newOwner] = await hre.viem.getWalletClients();
  const oracle = await hre.viem.deployContract("QuvrRiskOracle", [
    owner.account.address,
    publisher.account.address,
  ]);
  const as = async (who: typeof owner) =>
    hre.viem.getContractAt("QuvrRiskOracle", oracle.address, { client: { wallet: who } });
  return {
    oracle,
    owner,
    publisher,
    stranger,
    newOwner,
    asPublisher: await as(publisher),
    asStranger: await as(stranger),
    asNewOwner: await as(newOwner),
  };
}

describe("QuvrRiskOracle", () => {
  it("stores a label with the block time and emits an event", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publish([TOKEN_A, label()]);
    const a = await oracle.read.getAssessment([TOKEN_A]);
    expect(a.level).to.equal(Level.High);
    expect(a.contractScore).to.equal(40);
    expect(a.distributionScore).to.equal(NO_DATA);
    expect(a.flags).to.equal(0b11);
    expect(a.updatedAt).to.equal(await time.latest());
    const events = await oracle.getEvents.AssessmentPublished();
    expect(events).to.have.length(1);
    expect(getAddress(events[0]!.args.token as Address)).to.equal(TOKEN_A);
  });

  it("returns an empty (None) label for unknown tokens — no data, not low risk", async () => {
    const { oracle } = await loadFixture(deploy);
    const a = await oracle.read.getAssessment([TOKEN_B]);
    expect(a.level).to.equal(Level.None);
    expect(await oracle.read.isHighRisk([TOKEN_B, 86_400n])).to.deep.equal([false, false]);
  });

  it("only lets publishers write", async () => {
    const { asStranger, stranger } = await loadFixture(deploy);
    await expect(asStranger.write.publish([TOKEN_A, label()])).to.be.rejectedWith("NotPublisher");
    void stranger;
  });

  it("rejects invalid labels", async () => {
    const { asPublisher } = await loadFixture(deploy);
    await expect(asPublisher.write.publish([zeroAddress, label()])).to.be.rejectedWith(
      "InvalidAddress",
    );
    await expect(asPublisher.write.publish([TOKEN_A, label({ level: Level.None })])).to.be.rejected;
    await expect(
      asPublisher.write.publish([TOKEN_A, label({ contractScore: 101 })]),
    ).to.be.rejectedWith("InvalidScore");
    await expect(asPublisher.write.publish([TOKEN_A, label({ flags: 1 << 8 })])).to.be.rejectedWith(
      "UnknownFlags",
    );
  });

  it("publishes batches and checks lengths", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publishBatch([
      [TOKEN_A, TOKEN_B],
      [label(), label({ level: Level.Low, flags: 0 })],
    ]);
    expect((await oracle.read.getAssessment([TOKEN_B])).level).to.equal(Level.Low);
    await expect(
      asPublisher.write.publishBatch([[TOKEN_A], [label(), label()]]),
    ).to.be.rejectedWith("LengthMismatch");
  });

  it("isHighRisk respects freshness and ignores insufficient data", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publishBatch([
      [TOKEN_A, TOKEN_B],
      [label(), label({ level: Level.Insufficient })],
    ]);
    expect(await oracle.read.isHighRisk([TOKEN_A, 3_600n])).to.deep.equal([true, true]);
    expect(await oracle.read.isHighRisk([TOKEN_B, 3_600n])).to.deep.equal([false, false]);
    await time.increase(3_601);
    expect(await oracle.read.isHighRisk([TOKEN_A, 3_600n])).to.deep.equal([false, false]);
  });

  it("owner manages publishers; ownership moves in two steps", async () => {
    const { oracle, asPublisher, asStranger, stranger, newOwner, asNewOwner } =
      await loadFixture(deploy);
    await expect(
      asStranger.write.setPublisher([stranger.account.address, true]),
    ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    await oracle.write.setPublisher([stranger.account.address, true]);
    await asStranger.write.publish([TOKEN_A, label()]);
    await oracle.write.setPublisher([stranger.account.address, false]);
    await expect(asStranger.write.publish([TOKEN_A, label()])).to.be.rejectedWith("NotPublisher");

    await oracle.write.transferOwnership([newOwner.account.address]);
    expect(getAddress(await oracle.read.owner())).to.not.equal(
      getAddress(newOwner.account.address),
    );
    await asNewOwner.write.acceptOwnership();
    expect(getAddress(await oracle.read.owner())).to.equal(getAddress(newOwner.account.address));
    void asPublisher;
  });
});
