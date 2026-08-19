import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { DurchexCollection1155 } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function signVoucher(
  collectionAddress: string,
  creator: HardhatEthersSigner,
  o: Partial<{ tokenId: number; minPrice: bigint; royaltyBps: number; maxSupply: number; nonce: number }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const voucher = {
    tokenId: o.tokenId ?? 1001,
    uri: "internal://durchex/edition/1001.json",
    minPrice: o.minPrice ?? ethers.parseEther("0.01"),
    creator: creator.address,
    royaltyBps: o.royaltyBps ?? 500,
    maxSupply: o.maxSupply ?? 100,
    nonce: o.nonce ?? 1,
    deadline: 0,
  };
  const signature = await creator.signTypedData(
    // Domain name matches DurchexNFT1155 on purpose — the clone's address
    // is what separates collections, so app signing needs no change.
    { name: "DurchexNFT1155", version: "1", chainId, verifyingContract: collectionAddress },
    {
      EditionVoucher: [
        { name: "tokenId", type: "uint256" },
        { name: "uri", type: "string" },
        { name: "minPrice", type: "uint256" },
        { name: "creator", type: "address" },
        { name: "royaltyBps", type: "uint96" },
        { name: "maxSupply", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    voucher
  );
  return { voucher, signature };
}

describe("DurchexCollection1155Factory", () => {
  async function deployFixture() {
    const [owner, feeRecipient, creatorA, creatorB, buyer, stranger] = await ethers.getSigners();

    const Marketplace = await ethers.getContractFactory("DurchexMarketplace");
    const marketplace = await Marketplace.deploy(feeRecipient.address);
    await marketplace.waitForDeployment();

    const Factory = await ethers.getContractFactory("DurchexCollection1155Factory");
    const factory = await Factory.deploy(await marketplace.getAddress());
    await factory.waitForDeployment();

    return {
      factory,
      marketplace,
      owner,
      feeRecipient,
      creatorA,
      creatorB,
      buyer,
      stranger,
      saltA: ethers.id("edition-collection-a"),
      saltB: ethers.id("edition-collection-b"),
    };
  }

  const at = async (addr: string) =>
    (await ethers.getContractAt("DurchexCollection1155", addr)) as DurchexCollection1155;

  it("predicts an address before deployment and deploys there", async () => {
    const { factory, creatorA, saltA } = await loadFixture(deployFixture);
    const predicted = await factory.predictCollection(saltA);

    expect(await factory.isDeployed(saltA)).to.equal(false);
    expect(await ethers.provider.getCode(predicted)).to.equal("0x");

    await factory.deployCollection(saltA, "Alpha Editions", "ALPHA", creatorA.address);

    expect(await factory.isDeployed(saltA)).to.equal(true);
    expect(await factory.predictCollection(saltA)).to.equal(predicted);
  });

  it("gives each collection its own address, name and owner", async () => {
    const { factory, creatorA, creatorB, saltA, saltB } = await loadFixture(deployFixture);
    await factory.deployCollection(saltA, "Alpha Editions", "ALPHA", creatorA.address);
    await factory.deployCollection(saltB, "Beta Editions", "BETA", creatorB.address);

    const a = await at(await factory.predictCollection(saltA));
    const b = await at(await factory.predictCollection(saltB));

    expect(await a.getAddress()).to.not.equal(await b.getAddress());
    // ERC-1155 has no name in the standard; without these each clone would
    // show up unnamed on explorers, defeating the split.
    expect(await a.name()).to.equal("Alpha Editions");
    expect(await b.name()).to.equal("Beta Editions");
    expect(await a.owner()).to.equal(creatorA.address);
    expect(await b.owner()).to.equal(creatorB.address);
  });

  it("is idempotent so racing first-buyers can't fail", async () => {
    const { factory, creatorA, saltA } = await loadFixture(deployFixture);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await expect(factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address)).to.not.be.reverted;
  });

  it("mints partial quantity against a voucher signed before deployment", async () => {
    const { factory, marketplace, creatorA, buyer, saltA } = await loadFixture(deployFixture);
    const predicted = await factory.predictCollection(saltA);
    const { voucher, signature } = await signVoucher(predicted, creatorA);

    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await marketplace
      .connect(buyer)
      .buyLazy1155(predicted, 10, voucher, signature, { value: voucher.minPrice * BigInt(10) });

    const collection = await at(predicted);
    expect(await collection.balanceOf(buyer.address, voucher.tokenId)).to.equal(10);
    expect(await collection.minted(voucher.tokenId)).to.equal(10);
  });

  it("rejects a voucher signed for a different collection", async () => {
    const { factory, marketplace, creatorA, buyer, saltA, saltB } = await loadFixture(deployFixture);
    const addrA = await factory.predictCollection(saltA);
    const addrB = await factory.predictCollection(saltB);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await factory.deployCollection(saltB, "Beta", "BETA", creatorA.address);

    // Signed for A, replayed against B. The EIP-712 domain includes
    // address(this), so B must refuse — the isolation a shared contract
    // could never give.
    const { voucher, signature } = await signVoucher(addrA, creatorA);
    await expect(
      marketplace.connect(buyer).buyLazy1155(addrB, 1, voucher, signature, { value: voucher.minPrice })
    ).to.be.revertedWith("DurchexCollection1155: invalid signature");
  });

  it("keeps token ids and supply accounting independent per collection", async () => {
    const { factory, marketplace, creatorA, buyer, saltA, saltB } = await loadFixture(deployFixture);
    const addrA = await factory.predictCollection(saltA);
    const addrB = await factory.predictCollection(saltB);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    await factory.deployCollection(saltB, "Beta", "BETA", creatorA.address);

    // Same tokenId and nonce in both — impossible on a shared contract.
    const a = await signVoucher(addrA, creatorA, { tokenId: 1001, nonce: 1, maxSupply: 5 });
    const b = await signVoucher(addrB, creatorA, { tokenId: 1001, nonce: 1, maxSupply: 5 });

    await marketplace.connect(buyer).buyLazy1155(addrA, 5, a.voucher, a.signature, { value: a.voucher.minPrice * BigInt(5) });
    // A is now sold out; B must be entirely unaffected by that.
    await expect(
      marketplace.connect(buyer).buyLazy1155(addrB, 5, b.voucher, b.signature, { value: b.voucher.minPrice * BigInt(5) })
    ).to.not.be.reverted;

    expect(await (await at(addrA)).minted(1001)).to.equal(5);
    expect(await (await at(addrB)).minted(1001)).to.equal(5);
  });

  it("still enforces max supply on a clone", async () => {
    const { factory, marketplace, creatorA, buyer, saltA } = await loadFixture(deployFixture);
    const addr = await factory.predictCollection(saltA);
    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    const { voucher, signature } = await signVoucher(addr, creatorA, { maxSupply: 3 });

    await marketplace.connect(buyer).buyLazy1155(addr, 3, voucher, signature, { value: voucher.minPrice * BigInt(3) });
    await expect(
      marketplace.connect(buyer).buyLazy1155(addr, 1, voucher, signature, { value: voucher.minPrice })
    ).to.be.revertedWith("DurchexCollection1155: exceeds max supply");
  });

  it("locks the implementation and blocks re-initialization of a clone", async () => {
    const { factory, creatorA, stranger, saltA } = await loadFixture(deployFixture);
    const impl = await at(await factory.implementation());
    await expect(
      impl.connect(stranger).initialize("Evil", "EVIL", stranger.address, stranger.address)
    ).to.be.revertedWithCustomError(impl, "InvalidInitialization");

    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    const a = await at(await factory.predictCollection(saltA));
    await expect(
      a.connect(stranger).initialize("Evil", "EVIL", stranger.address, stranger.address)
    ).to.be.revertedWithCustomError(a, "InvalidInitialization");
    expect(await a.owner()).to.equal(creatorA.address);
  });

  it("rejects a zero owner and blocks renouncing", async () => {
    const { factory, creatorA, saltA } = await loadFixture(deployFixture);
    await expect(
      factory.deployCollection(saltA, "Alpha", "ALPHA", ethers.ZeroAddress)
    ).to.be.revertedWith("DurchexCollection1155Factory: zero owner");

    await factory.deployCollection(saltA, "Alpha", "ALPHA", creatorA.address);
    const a = await at(await factory.predictCollection(saltA));
    await expect(a.connect(creatorA).renounceOwnership()).to.be.revertedWith(
      "DurchexCollection1155: renounce disabled"
    );
  });
});
