import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { DurchexNFT } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Covers the operational levers that exist specifically so a live
// deployment never has to be replaced: adjustable fee, movable fee
// recipient, emergency pause, on-chain royalty ceiling, refunds of
// overpayment, and protection against bricking ownership.

async function buildVoucher(
  nft: DurchexNFT,
  creator: HardhatEthersSigner,
  overrides: Partial<{ tokenId: number; minPrice: bigint; royaltyBps: number; nonce: number }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const voucher = {
    tokenId: overrides.tokenId ?? 1,
    uri: "internal://durchex/gov/1.json",
    minPrice: overrides.minPrice ?? ethers.parseEther("1"),
    creator: creator.address,
    royaltyBps: overrides.royaltyBps ?? 500,
    nonce: overrides.nonce ?? 0,
    deadline: 0,
  };
  const domain = { name: "Durchex", version: "1", chainId, verifyingContract: await nft.getAddress() };
  const types = {
    NFTVoucher: [
      { name: "tokenId", type: "uint256" },
      { name: "uri", type: "string" },
      { name: "minPrice", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "royaltyBps", type: "uint96" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const signature = await creator.signTypedData(domain, types, voucher);
  return { voucher, signature };
}

describe("Durchex governance & safety levers", () => {
  async function deployFixture() {
    const [owner, feeRecipient, creator, buyer, stranger, newFeeRecipient] = await ethers.getSigners();

    const DurchexNFT = await ethers.getContractFactory("DurchexNFT");
    const nft = await DurchexNFT.deploy();
    await nft.waitForDeployment();

    const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
    const marketplace = await DurchexMarketplace.deploy(feeRecipient.address);
    await marketplace.waitForDeployment();

    await nft.connect(owner).setMarketplace(await marketplace.getAddress());

    return { nft, marketplace, owner, feeRecipient, creator, buyer, stranger, newFeeRecipient };
  }

  it("starts at a 10% fee under a 20% immutable ceiling", async () => {
    const { marketplace } = await loadFixture(deployFixture);
    expect(await marketplace.platformFeeBps()).to.equal(1000);
    expect(await marketplace.MAX_PLATFORM_FEE_BPS()).to.equal(2000);
  });

  it("lets the owner change the fee, and applies it to the next sale", async () => {
    const { nft, marketplace, feeRecipient, creator, buyer } = await loadFixture(deployFixture);
    await expect(marketplace.setPlatformFee(250)).to.emit(marketplace, "PlatformFeeUpdated").withArgs(250);

    const price = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price });
    const feeBefore = await ethers.provider.getBalance(feeRecipient.address);

    await marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price });

    // 2.5% now, not the original 10%.
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(feeBefore + (price * 250n) / 10000n);
  });

  it("refuses a fee above the ceiling, and refuses non-owners entirely", async () => {
    const { marketplace, stranger } = await loadFixture(deployFixture);
    await expect(marketplace.setPlatformFee(2001)).to.be.revertedWith("DurchexMarketplace: fee exceeds ceiling");
    await expect(marketplace.connect(stranger).setPlatformFee(100)).to.be.reverted;
    // The ceiling itself is still honoured at exactly the boundary.
    await expect(marketplace.setPlatformFee(2000)).to.not.be.reverted;
  });

  it("lets the owner move fee income to a new recipient", async () => {
    const { nft, marketplace, creator, buyer, newFeeRecipient } = await loadFixture(deployFixture);
    await expect(marketplace.setFeeRecipient(newFeeRecipient.address))
      .to.emit(marketplace, "FeeRecipientUpdated")
      .withArgs(newFeeRecipient.address);

    const price = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price });
    const before = await ethers.provider.getBalance(newFeeRecipient.address);

    await marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price });

    expect(await ethers.provider.getBalance(newFeeRecipient.address)).to.equal(before + (price * 1000n) / 10000n);
  });

  it("rejects a zero fee recipient", async () => {
    const { marketplace } = await loadFixture(deployFixture);
    await expect(marketplace.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWith(
      "DurchexMarketplace: zero fee recipient"
    );
  });

  it("halts purchases while paused and resumes after unpausing", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price });

    await marketplace.pause();
    await expect(
      marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price })
    ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

    await marketplace.unpause();
    await expect(marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price })).to
      .not.be.reverted;
  });

  it("still lets sellers cancel listings while paused", async () => {
    const { marketplace, buyer } = await loadFixture(deployFixture);
    await marketplace.pause();
    // Sellers must never be trapped in a listing by an admin pause.
    await expect(marketplace.connect(buyer).cancelListing(1)).to.not.be.reverted;
    await expect(marketplace.connect(buyer).cancelListing1155(1)).to.not.be.reverted;
  });

  it("only the owner can pause", async () => {
    const { marketplace, stranger } = await loadFixture(deployFixture);
    await expect(marketplace.connect(stranger).pause()).to.be.reverted;
  });

  it("refunds overpayment instead of stranding it in the contract", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const overpay = ethers.parseEther("1.5");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price });

    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await marketplace
      .connect(buyer)
      .buyLazy(await nft.getAddress(), voucher, signature, { value: overpay });
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;

    // Buyer is out exactly the price plus gas — the extra 0.5 came back.
    expect(await ethers.provider.getBalance(buyer.address)).to.equal(before - price - gas);
    // And nothing accumulated in the marketplace itself.
    expect(await ethers.provider.getBalance(await marketplace.getAddress())).to.equal(0n);
  });

  it("rejects a voucher whose royalty exceeds the on-chain cap", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    // 95% royalty — would make fee + royalty exceed the sale price and
    // permanently brick this token if it were ever mintable.
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price, royaltyBps: 9500 });

    await expect(
      marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price })
    ).to.be.revertedWith("DurchexNFT: royalty exceeds cap");
  });

  it("accepts a royalty exactly at the cap", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price, royaltyBps: 3000 });
    await expect(marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price })).to
      .not.be.reverted;
  });

  it("blocks renouncing ownership on every contract, but allows transfer", async () => {
    const { nft, marketplace, stranger } = await loadFixture(deployFixture);

    await expect(marketplace.renounceOwnership()).to.be.revertedWith("DurchexMarketplace: renounce disabled");
    await expect(nft.renounceOwnership()).to.be.revertedWith("DurchexNFT: renounce disabled");

    const DurchexNFT1155 = await ethers.getContractFactory("DurchexNFT1155");
    const nft1155 = await DurchexNFT1155.deploy();
    await nft1155.waitForDeployment();
    await expect(nft1155.renounceOwnership()).to.be.revertedWith("DurchexNFT1155: renounce disabled");

    // Handing control to a new owner (e.g. a multisig) still works.
    await expect(marketplace.transferOwnership(stranger.address)).to.not.be.reverted;
    expect(await marketplace.owner()).to.equal(stranger.address);
  });
});
