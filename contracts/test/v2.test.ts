import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, keccak256, toHex } from "viem";

/** v2 features: permanent first-label proof, batch reads, public project responses. */
const Level = { None: 0, Low: 1, Elevated: 2, High: 3, Insufficient: 4 } as const;
const T1 = getAddress("0x0000000000000000000000000000000000000a11");
const T2 = getAddress("0x0000000000000000000000000000000000000b22");
const label = (level: number) => ({
  level,
  contractScore: 50,
  liquidityScore: 50,
  distributionScore: 255,
  flags: 0,
  reportHash: keccak256(toHex(`r${level}`)),
});

async function deploy() {
  const [owner, publisher, team, anyone] = await hre.viem.getWalletClients();
  const oracle = await hre.viem.deployContract("QuvrRiskOracle", [
    owner.account.address,
    publisher.account.address,
  ]);
  const as = async (w: typeof owner) =>
    hre.viem.getContractAt("QuvrRiskOracle", oracle.address, { client: { wallet: w } });
  return {
    oracle,
    team,
    asPublisher: await as(publisher),
    asTeam: await as(team),
    asAnyone: await as(anyone),
  };
}

describe("QuvrRiskOracle v2", () => {
  it("reports its version", async () => {
    const { oracle } = await loadFixture(deploy);
    expect(await oracle.read.VERSION()).to.equal("2");
  });

  it("keeps the first label time forever and counts labels", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publish([T1, label(Level.Elevated)]);
    const first = await oracle.read.getAssessment([T1]);
    await time.increase(3_600);
    await asPublisher.write.publish([T1, label(Level.Low)]);
    const a = await oracle.read.getAssessment([T1]);
    expect(a.firstLabeledAt).to.equal(first.updatedAt);
    expect(a.updatedAt).to.be.greaterThan(first.updatedAt);
    expect(a.labelCount).to.equal(2);
    expect(a.firstHighAt).to.equal(0);
  });

  it("records the first High once, even if the level later drops and rises again", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publish([T1, label(Level.Elevated)]);
    await time.increase(60);
    await asPublisher.write.publish([T1, label(Level.High)]);
    const firstHigh = (await oracle.read.getAssessment([T1])).firstHighAt;
    expect(firstHigh).to.be.greaterThan(0);
    await time.increase(60);
    await asPublisher.write.publish([T1, label(Level.Low)]);
    await time.increase(60);
    await asPublisher.write.publish([T1, label(Level.High)]);
    const a = await oracle.read.getAssessment([T1]);
    expect(a.firstHighAt).to.equal(firstHigh);
    expect(a.level).to.equal(Level.High);
    expect(a.labelCount).to.equal(4);
  });

  it("reads many tokens in one call, unknown ones as None", async () => {
    const { oracle, asPublisher } = await loadFixture(deploy);
    await asPublisher.write.publish([T1, label(Level.High)]);
    const out = await oracle.read.getAssessments([[T1, T2]]);
    expect(out.map((x) => x.level)).to.deep.equal([Level.High, Level.None]);
  });

  it("lets anyone reply publicly to an assessed token, within limits", async () => {
    const { oracle, team, asPublisher, asTeam } = await loadFixture(deploy);
    await expect(asTeam.write.respond([T1, "hello"])).to.be.rejectedWith("NotAssessed");
    await asPublisher.write.publish([T1, label(Level.Elevated)]);
    await asTeam.write.respond([T1, "Proxy is an EIP-1167 clone; logic cannot change."]);
    const ev = await oracle.getEvents.ProjectResponse({ token: T1 });
    expect(ev).to.have.length(1);
    expect(getAddress(ev[0]!.args.responder!)).to.equal(getAddress(team.account.address));
    await expect(asTeam.write.respond([T1, ""])).to.be.rejectedWith("InvalidResponse");
    await expect(asTeam.write.respond([T1, "x".repeat(281)])).to.be.rejectedWith("InvalidResponse");
    await asTeam.write.respond([T1, "x".repeat(280)]);
  });

  it("responses never change the label", async () => {
    const { oracle, asPublisher, asAnyone } = await loadFixture(deploy);
    await asPublisher.write.publish([T1, label(Level.High)]);
    const before = await oracle.read.getAssessment([T1]);
    await asAnyone.write.respond([T1, "not a rug, trust me"]);
    expect(await oracle.read.getAssessment([T1])).to.deep.equal(before);
  });
});
