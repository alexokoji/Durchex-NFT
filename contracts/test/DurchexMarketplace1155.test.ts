import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { DurchexNFT1155 } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function buildVoucher(
  nft: DurchexNFT1155,
  creator: HardhatEthersSigner,
  overrides: Partial<{
    tokenId: number;
    uri: string;
    minPrice: bigint;
    royaltyBps: number;
    maxSupply: number;
    nonce: number;
    deadline: number;
  }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const voucher = {
    tokenId: overrides.tokenId ?? 1001,
    uri: overrides.uri ?? "internal://durchex/test-collection/1001.json",
    minPrice: overrides.minPrice ?? ethers.parseEther("0.05"),
    creator: creator.address,
    royaltyBps: overrides.royaltyBps ?? 500,
    maxSupply: overrides.maxSupply ?? 500,
    nonce: overrides.nonce ?? 1,
    deadline: overrides.deadline ?? 0,
  };
  const domain = { name: "DurchexNFT1155", version: "1", chainId, verifyingContract: await nft.getAddress() };
  const types = {
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
  };
  const signature = await creator.signTypedData(domain, types, voucher);
  return { voucher, signature };
}

async function buildListing1155(
  marketplace: { getAddress(): Promise<string> },
  seller: HardhatEthersSigner,
  overrides: Partial<{
    nft: string;
    tokenId: number;
    buyer: string;
    quantity: number;
    pricePerUnit: bigint;
    deadline: number;
    nonce: number;
  }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const listing = {
    nft: overrides.nft ?? ethers.ZeroAddress,
    tokenId: overrides.tokenId ?? 1001,
    seller: seller.address,
    buyer: overrides.buyer ?? ethers.ZeroAddress,
    quantity: overrides.quantity ?? 10,
    pricePerUnit: overrides.pricePerUnit ?? ethers.parseEther("0.1"),
    deadline: overrides.deadline ?? 0,
    nonce: overrides.nonce ?? 1,
  };
  const domain = { name: "DurchexMarketplace", version: "1", chainId, verifyingContract: await marketplace.getAddress() };
  const types = {
    Listing1155: [
      { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "seller", type: "address" },
      { name: "buyer", type: "address" },
      { name: "quantity", type: "uint256" },
      { name: "pricePerUnit", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  };
  const signature = await seller.signTypedData(domain, types, listing);
  return { listing, signature };
}

describe("DurchexMarketplace (ERC-1155)", () => {
  async function deployFixture() {
    const [owner, feeRecipient, creator, buyerA, buyerB] = await ethers.getSigners();

    const DurchexNFT1155 = await ethers.getContractFactory("DurchexNFT1155");
    const nft = await DurchexNFT1155.deploy();
    await nft.waitForDeployment();

    const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
    const marketplace = await DurchexMarketplace.deploy(feeRecipient.address);
    await marketplace.waitForDeployment();

    await nft.connect(owner).setMarketplace(await marketplace.getAddress());

    return { nft, marketplace, owner, feeRecipient, creator, buyerA, buyerB };
  }

  it("buys a partial quantity of a lazy edition and splits fee/royalty per the total price", async () => {
    const { nft, marketplace, feeRecipient, creator, buyerA } = await loadFixture(deployFixture);
    const pricePerUnit = ethers.parseEther("0.05");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: pricePerUnit, maxSupply: 500 });
    const quantity = 10n;
    const totalPrice = pricePerUnit * quantity;

    const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
    const creatorBefore = await ethers.provider.getBalance(creator.address);

    await expect(
      marketplace.connect(buyerA).buyLazy1155(await nft.getAddress(), quantity, voucher, signature, { value: totalPrice })
    )
      .to.emit(marketplace, "EditionRedeemed")
      .withArgs(await nft.getAddress(), voucher.tokenId, buyerA.address, quantity, totalPrice);

    expect(await nft.balanceOf(buyerA.address, voucher.tokenId)).to.equal(quantity);

    const expectedFee = (totalPrice * 1000n) / 10000n;
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(feeBefore + expectedFee);
    expect(await ethers.provider.getBalance(creator.address)).to.equal(creatorBefore + (totalPrice - expectedFee));
  });

  it("rejects underpaying for the requested quantity", async () => {
    const { nft, marketplace, creator, buyerA } = await loadFixture(deployFixture);
    const pricePerUnit = ethers.parseEther("0.05");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: pricePerUnit });

    await expect(
      marketplace.connect(buyerA).buyLazy1155(await nft.getAddress(), 10, voucher, signature, {
        value: ethers.parseEther("0.4"), // needs 0.5
      })
    ).to.be.revertedWith("DurchexMarketplace: insufficient payment");
  });

  it("lets two different buyers each fill part of the same resale listing", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const pricePerUnit = ethers.parseEther("0.05");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: pricePerUnit, maxSupply: 500 });
    await marketplace.connect(buyerA).buyLazy1155(await nft.getAddress(), 100, voucher, signature, {
      value: pricePerUnit * 100n,
    });

    await nft.connect(buyerA).setApprovalForAll(await marketplace.getAddress(), true);

    const resalePrice = ethers.parseEther("0.1");
    const { listing, signature: listingSig } = await buildListing1155(marketplace, buyerA, {
      nft: await nft.getAddress(),
      tokenId: voucher.tokenId,
      quantity: 60,
      pricePerUnit: resalePrice,
    });

    await marketplace.connect(buyerB).buyListed1155(listing, 20, listingSig, { value: resalePrice * 20n });
    expect(await nft.balanceOf(buyerB.address, voucher.tokenId)).to.equal(20);
    expect(await marketplace.listing1155Filled(buyerA.address, listing.nonce)).to.equal(20);

    await marketplace.connect(buyerB).buyListed1155(listing, 15, listingSig, { value: resalePrice * 15n });
    expect(await nft.balanceOf(buyerB.address, voucher.tokenId)).to.equal(35);
    expect(await marketplace.listing1155Filled(buyerA.address, listing.nonce)).to.equal(35);

    // buyerA started with 100, sold 35 total so far, so 65 remain with them.
    expect(await nft.balanceOf(buyerA.address, voucher.tokenId)).to.equal(65);
  });

  it("rejects filling beyond the listing's authorized quantity", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const pricePerUnit = ethers.parseEther("0.05");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: pricePerUnit, maxSupply: 500 });
    await marketplace.connect(buyerA).buyLazy1155(await nft.getAddress(), 100, voucher, signature, {
      value: pricePerUnit * 100n,
    });
    await nft.connect(buyerA).setApprovalForAll(await marketplace.getAddress(), true);

    const resalePrice = ethers.parseEther("0.1");
    const { listing, signature: listingSig } = await buildListing1155(marketplace, buyerA, {
      nft: await nft.getAddress(),
      tokenId: voucher.tokenId,
      quantity: 10,
      pricePerUnit: resalePrice,
    });

    await marketplace.connect(buyerB).buyListed1155(listing, 7, listingSig, { value: resalePrice * 7n });
    await expect(
      marketplace.connect(buyerB).buyListed1155(listing, 5, listingSig, { value: resalePrice * 5n })
    ).to.be.revertedWith("DurchexMarketplace: exceeds listing quantity");

    // Exactly the remainder still works.
    await expect(marketplace.connect(buyerB).buyListed1155(listing, 3, listingSig, { value: resalePrice * 3n }))
      .to.not.be.reverted;
  });

  it("rejects a listing that sells more than the seller currently holds", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const pricePerUnit = ethers.parseEther("0.05");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: pricePerUnit, maxSupply: 500 });
    await marketplace.connect(buyerA).buyLazy1155(await nft.getAddress(), 5, voucher, signature, {
      value: pricePerUnit * 5n,
    });
    await nft.connect(buyerA).setApprovalForAll(await marketplace.getAddress(), true);

    const resalePrice = ethers.parseEther("0.1");
    const { listing, signature: listingSig } = await buildListing1155(marketplace, buyerA, {
      nft: await nft.getAddress(),
      tokenId: voucher.tokenId,
      quantity: 20, // seller only actually holds 5
      pricePerUnit: resalePrice,
    });

    await expect(
      marketplace.connect(buyerB).buyListed1155(listing, 10, listingSig, { value: resalePrice * 10n })
    ).to.be.revertedWith("DurchexMarketplace: seller balance too low");
  });

  it("lets a seller cancel a 1155 listing before it's fully filled, blocking further fills", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const pricePerUnit = ethers.parseEther("0.05");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: pricePerUnit, maxSupply: 500 });
    await marketplace.connect(buyerA).buyLazy1155(await nft.getAddress(), 100, voucher, signature, {
      value: pricePerUnit * 100n,
    });
    await nft.connect(buyerA).setApprovalForAll(await marketplace.getAddress(), true);

    const resalePrice = ethers.parseEther("0.1");
    const { listing, signature: listingSig } = await buildListing1155(marketplace, buyerA, {
      nft: await nft.getAddress(),
      tokenId: voucher.tokenId,
      quantity: 50,
      pricePerUnit: resalePrice,
    });

    await expect(marketplace.connect(buyerA).cancelListing1155(listing.nonce))
      .to.emit(marketplace, "Listing1155Cancelled")
      .withArgs(buyerA.address, listing.nonce);

    await expect(
      marketplace.connect(buyerB).buyListed1155(listing, 5, listingSig, { value: resalePrice * 5n })
    ).to.be.revertedWith("DurchexMarketplace: listing cancelled");
  });

  it("restricts a 1155 listing to a specific authorized buyer", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const pricePerUnit = ethers.parseEther("0.05");
    const { voucher, signature } = await buildVoucher(nft, creator, { minPrice: pricePerUnit, maxSupply: 500 });
    await marketplace.connect(buyerA).buyLazy1155(await nft.getAddress(), 100, voucher, signature, {
      value: pricePerUnit * 100n,
    });
    await nft.connect(buyerA).setApprovalForAll(await marketplace.getAddress(), true);

    const resalePrice = ethers.parseEther("0.1");
    const { listing, signature: listingSig } = await buildListing1155(marketplace, buyerA, {
      nft: await nft.getAddress(),
      tokenId: voucher.tokenId,
      quantity: 10,
      pricePerUnit: resalePrice,
      buyer: buyerB.address,
    });

    await expect(
      marketplace.connect(creator).buyListed1155(listing, 5, listingSig, { value: resalePrice * 5n })
    ).to.be.revertedWith("DurchexMarketplace: not the authorized buyer");

    await expect(marketplace.connect(buyerB).buyListed1155(listing, 5, listingSig, { value: resalePrice * 5n })).to
      .not.be.reverted;
  });
});
