import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { DurchexCollection } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function signVoucher(
  collectionAddress: string,
  creator: HardhatEthersSigner,
  o: Partial<{ tokenId: number; minPrice: bigint; royaltyBps: number; nonce: number }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const voucher = {
    tokenId: o.tokenId ?? 1,
    uri: "internal://durchex/clone/1.json",
    minPrice: o.minPrice ?? ethers.parseEther("0.01"),
    creator: creator.address,
    royaltyBps: o.royaltyBps ?? 500,
    nonce: o.nonce ?? 0,
    deadline: 0,
  };
  const signature = await creator.signTypedData(
    { name: "Durchex", version: "1", chainId, verifyingContract: collectionAddress },
    {
      NFTVoucher: [
        { name: "tokenId", type: "uint256" },
        { name: "uri", type: "string" },
        { name: "minPrice", type: "uint256" },
        { name: "creator", type: "address" },
        { name: "royaltyBps", type: "uint96" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    voucher
  );
  return { voucher, signature };
}

describe("DurchexCollectionFactory", () => {
  async function deployFixture() {
    const [owner, feeRecipient, creatorA, creatorB, buyer, stranger] = await ethers.getSigners();

    const Marketplace = await ethers.getContractFactory("DurchexMarketplace");
    const marketplace = await Marketplace.deploy(feeRecipient.address);
    await marketplace.waitForDeployment();

    const Factory = await ethers.getContractFactory("DurchexCollectionFactory");
    const factory = await Factory.deploy(await marketplace.getAddress());
    await factory.waitForDeployment();

    const saltA = ethers.id("collection-a");
    const saltB = ethers.id("collection-b");
    return { factory, marketplace, owner, feeRecipient, creatorA, creatorB, buyer, stranger, saltA, saltB };
  }

  it("predicts a collection's address before it exists, and deploys there", async () => {
    const { factory, creatorA, saltA } = await loadFixture(deployFixture);
    const predicted = await factory.predictCollection(saltA);

    expect(await factory.isDeployed(saltA)).to.equal(false);
    expect(await ethers.provider.getCode(predicted)).to.equal("0x");

    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);

    expect(await factory.isDeployed(saltA)).to.equal(true);
    const deployed = await factory.predictCollection(saltA);
    expect(deployed).to.equal(predicted);
    expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");
  });

  it("gives each collection its own address, name and owner", async () => {
    const { factory, creatorA, creatorB, saltA, saltB } = await loadFixture(deployFixture);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await factory.deployCollection(saltB, "Beta", "BETA", creatorB.address);

    const a = (await ethers.getContractAt("DurchexCollection", await factory.predictCollection(saltA))) as DurchexCollection;
    const b = (await ethers.getContractAt("DurchexCollection", await factory.predictCollection(saltB))) as DurchexCollection;

    expect(await a.getAddress()).to.not.equal(await b.getAddress());
    expect(await a.name()).to.equal("Alpha");
    expect(await b.name()).to.equal("Beta");
    expect(await a.owner()).to.equal(creatorA.address);
    expect(await b.owner()).to.equal(creatorB.address);
  });

  it("is idempotent — a second deploy returns the same address instead of reverting", async () => {
    const { factory, creatorA, saltA } = await loadFixture(deployFixture);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    // Two buyers can race to be the first mint; the loser must not fail.
    await expect(factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address)).to.not.be.reverted;
    expect(await factory.isDeployed(saltA)).to.equal(true);
  });

  it("mints through the marketplace against a voucher signed before deployment", async () => {
    const { factory, marketplace, creatorA, buyer, saltA } = await loadFixture(deployFixture);

    // Signed while the contract does not yet exist — the whole point of a
    // deterministic address.
    const predicted = await factory.predictCollection(saltA);
    const { voucher, signature } = await signVoucher(predicted, creatorA);

    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await marketplace.connect(buyer).buyLazy(predicted, voucher, signature, { value: voucher.minPrice });

    const collection = (await ethers.getContractAt("DurchexCollection", predicted)) as DurchexCollection;
    expect(await collection.ownerOf(voucher.tokenId)).to.equal(buyer.address);
  });

  it("rejects a voucher signed for a different collection", async () => {
    const { factory, marketplace, creatorA, buyer, saltA, saltB } = await loadFixture(deployFixture);
    const addrA = await factory.predictCollection(saltA);
    const addrB = await factory.predictCollection(saltB);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await factory.deployCollection(saltB, "Beta", "BETA", creatorA.address);

    // Signed against collection A, replayed against collection B. The
    // EIP-712 domain binds to address(this), so B must not accept it —
    // this is the isolation the shared contract could never provide.
    const { voucher, signature } = await signVoucher(addrA, creatorA);
    await expect(
      marketplace.connect(buyer).buyLazy(addrB, voucher, signature, { value: voucher.minPrice })
    ).to.be.revertedWith("DurchexCollection: invalid signature");
  });

  it("keeps token ids and creator nonces independent per collection", async () => {
    const { factory, marketplace, creatorA, buyer, saltA, saltB } = await loadFixture(deployFixture);
    const addrA = await factory.predictCollection(saltA);
    const addrB = await factory.predictCollection(saltB);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await factory.deployCollection(saltB, "Beta", "BETA", creatorA.address);

    // The same tokenId 1 and the same nonce 0 in both — impossible on a
    // shared contract, routine now.
    const a = await signVoucher(addrA, creatorA, { tokenId: 1, nonce: 0 });
    const b = await signVoucher(addrB, creatorA, { tokenId: 1, nonce: 0 });

    await marketplace.connect(buyer).buyLazy(addrA, a.voucher, a.signature, { value: a.voucher.minPrice });
    await expect(
      marketplace.connect(buyer).buyLazy(addrB, b.voucher, b.signature, { value: b.voucher.minPrice })
    ).to.not.be.reverted;
  });

  it("locks the implementation so it can't be initialized or hijacked", async () => {
    const { factory, stranger } = await loadFixture(deployFixture);
    const impl = (await ethers.getContractAt("DurchexCollection", await factory.implementation())) as DurchexCollection;
    await expect(
      impl.connect(stranger).initialize("Evil", "EVIL", stranger.address, stranger.address)
    ).to.be.revertedWithCustomError(impl, "InvalidInitialization");
  });

  it("won't let a deployed clone be re-initialized", async () => {
    const { factory, creatorA, stranger, saltA } = await loadFixture(deployFixture);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    const a = (await ethers.getContractAt("DurchexCollection", await factory.predictCollection(saltA))) as DurchexCollection;
    await expect(
      a.connect(stranger).initialize("Evil", "EVIL", stranger.address, stranger.address)
    ).to.be.revertedWithCustomError(a, "InvalidInitialization");
    expect(await a.owner()).to.equal(creatorA.address);
  });

  it("rejects a zero owner, and blocks renouncing on a clone", async () => {
    const { factory, creatorA, saltA } = await loadFixture(deployFixture);
    await expect(
      factory.deployCollection(saltA, "Alpha", "ALPHA", ethers.ZeroAddress)
    ).to.be.revertedWith("DurchexCollectionFactory: zero owner");

    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    const a = (await ethers.getContractAt("DurchexCollection", await factory.predictCollection(saltA))) as DurchexCollection;
    await expect(a.connect(creatorA).renounceOwnership()).to.be.revertedWith("DurchexCollection: renounce disabled");
  });
});
