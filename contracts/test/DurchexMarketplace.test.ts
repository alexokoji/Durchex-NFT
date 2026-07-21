import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { DurchexNFT } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function buildVoucher(
  nft: DurchexNFT,
  creator: HardhatEthersSigner,
  overrides: Partial<{ tokenId: number; uri: string; minPrice: bigint; royaltyBps: number; nonce: number }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const voucher = {
    tokenId: overrides.tokenId ?? 1,
    uri: overrides.uri ?? "internal://durchex/test-collection/1.json",
    minPrice: overrides.minPrice ?? ethers.parseEther("1"),
    creator: creator.address,
    royaltyBps: overrides.royaltyBps ?? 500, // 5%
    nonce: overrides.nonce ?? 0,
  };
  const domain = {
    name: "Durchex",
    version: "1",
    chainId,
    verifyingContract: await nft.getAddress(),
  };
  const types = {
    NFTVoucher: [
      { name: "tokenId", type: "uint256" },
      { name: "uri", type: "string" },
      { name: "minPrice", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "royaltyBps", type: "uint96" },
      { name: "nonce", type: "uint256" },
    ],
  };
  const signature = await creator.signTypedData(domain, types, voucher);
  return { voucher, signature };
}

describe("DurchexMarketplace", () => {
  async function deployFixture() {
    const [owner, feeRecipient, creator, buyer, resaleBuyer] = await ethers.getSigners();

    const DurchexNFT = await ethers.getContractFactory("DurchexNFT");
    const nft = await DurchexNFT.deploy();
    await nft.waitForDeployment();

    const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
    const marketplace = await DurchexMarketplace.deploy(feeRecipient.address);
    await marketplace.waitForDeployment();

    await nft.connect(owner).setMarketplace(await marketplace.getAddress());

    return { nft, marketplace, owner, feeRecipient, creator, buyer, resaleBuyer };
  }

  it("splits a lazy-mint sale between the platform fee and the creator", async () => {
    const { nft, marketplace, feeRecipient, creator, buyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price });

    const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
    const creatorBefore = await ethers.provider.getBalance(creator.address);

    await expect(
      marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price })
    )
      .to.emit(marketplace, "VoucherRedeemed")
      .withArgs(await nft.getAddress(), voucher.tokenId, buyer.address, price);

    expect(await nft.ownerOf(voucher.tokenId)).to.equal(buyer.address);

    // 2.5% platform fee; creator is both seller and royalty receiver on a
    // first sale, so they simply keep the rest (no separate royalty split).
    const expectedFee = (price * 250n) / 10000n;
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(feeBefore + expectedFee);
    expect(await ethers.provider.getBalance(creator.address)).to.equal(
      creatorBefore + (price - expectedFee)
    );
  });

  it("rejects a lazy purchase that underpays the voucher's minPrice", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price });

    await expect(
      marketplace
        .connect(buyer)
        .buyLazy(await nft.getAddress(), voucher, signature, { value: ethers.parseEther("0.5") })
    ).to.be.revertedWith("DurchexMarketplace: insufficient payment");
  });

  it("splits a resale between platform fee, original creator's royalty and seller", async () => {
    const { nft, marketplace, feeRecipient, creator, buyer, resaleBuyer } = await loadFixture(
      deployFixture
    );

    // First sale: lazy-mint to `buyer`, who becomes the owner/seller for the resale.
    const mintPrice = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: mintPrice });
    await marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, {
      value: mintPrice,
    });

    // `buyer` lists it for resale and approves the marketplace.
    await nft.connect(buyer).approve(await marketplace.getAddress(), voucher.tokenId);

    const resalePrice = ethers.parseEther("2");
    const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
    const creatorBefore = await ethers.provider.getBalance(creator.address);
    const sellerBefore = await ethers.provider.getBalance(buyer.address);

    await expect(
      marketplace
        .connect(resaleBuyer)
        .buyListed(await nft.getAddress(), voucher.tokenId, buyer.address, resalePrice, {
          value: resalePrice,
        })
    )
      .to.emit(marketplace, "ListingFilled")
      .withArgs(await nft.getAddress(), voucher.tokenId, buyer.address, resaleBuyer.address, resalePrice);

    expect(await nft.ownerOf(voucher.tokenId)).to.equal(resaleBuyer.address);

    const expectedFee = (resalePrice * 250n) / 10000n;
    const expectedRoyalty = (resalePrice * 500n) / 10000n; // creator's 5% royalty
    const expectedSellerProceeds = resalePrice - expectedFee - expectedRoyalty;

    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(feeBefore + expectedFee);
    expect(await ethers.provider.getBalance(creator.address)).to.equal(
      creatorBefore + expectedRoyalty
    );
    expect(await ethers.provider.getBalance(buyer.address)).to.equal(
      sellerBefore + expectedSellerProceeds
    );
  });

  it("rejects buyListed if the named seller no longer owns the token", async () => {
    const { nft, marketplace, creator, buyer, resaleBuyer } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: price });
    await marketplace.connect(buyer).buyLazy(await nft.getAddress(), voucher, signature, { value: price });

    // Note: `buyer` never approved the marketplace, and `creator` (the
    // stated seller) doesn't own the token at all.
    await expect(
      marketplace
        .connect(resaleBuyer)
        .buyListed(await nft.getAddress(), voucher.tokenId, creator.address, price, { value: price })
    ).to.be.revertedWith("DurchexMarketplace: seller no longer owns token");
  });

  it("rejects deployment with a zero fee recipient", async () => {
    const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
    await expect(DurchexMarketplace.deploy(ethers.ZeroAddress)).to.be.revertedWith(
      "DurchexMarketplace: zero fee recipient"
    );
  });
});
