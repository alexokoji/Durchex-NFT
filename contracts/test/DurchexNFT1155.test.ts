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
  const domain = {
    name: "DurchexNFT1155",
    version: "1",
    chainId,
    verifyingContract: await nft.getAddress(),
  };
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

describe("DurchexNFT1155", () => {
  async function deployFixture() {
    const [owner, marketplace, creator, buyerA, buyerB, stranger] = await ethers.getSigners();

    const DurchexNFT1155 = await ethers.getContractFactory("DurchexNFT1155");
    const nft = await DurchexNFT1155.deploy();
    await nft.waitForDeployment();
    await nft.connect(owner).setMarketplace(marketplace.address);

    return { nft, owner, marketplace, creator, buyerA, buyerB, stranger };
  }

  it("mints partial quantity to a buyer and tracks minted count", async () => {
    const { nft, marketplace, creator, buyerA } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator, { maxSupply: 500 });

    await expect(nft.connect(marketplace).redeem(buyerA.address, 10, voucher, signature))
      .to.emit(nft, "TransferSingle")
      .withArgs(marketplace.address, ethers.ZeroAddress, buyerA.address, voucher.tokenId, 10);

    expect(await nft.balanceOf(buyerA.address, voucher.tokenId)).to.equal(10);
    expect(await nft.minted(voucher.tokenId)).to.equal(10);
    expect(await nft.uri(voucher.tokenId)).to.equal(voucher.uri);
  });

  it("lets multiple different buyers redeem the same voucher for different quantities", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator, { maxSupply: 500 });

    await nft.connect(marketplace).redeem(buyerA.address, 300, voucher, signature);
    await nft.connect(marketplace).redeem(buyerB.address, 150, voucher, signature);

    expect(await nft.balanceOf(buyerA.address, voucher.tokenId)).to.equal(300);
    expect(await nft.balanceOf(buyerB.address, voucher.tokenId)).to.equal(150);
    expect(await nft.minted(voucher.tokenId)).to.equal(450);
  });

  it("rejects a redemption that would exceed maxSupply", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator, { maxSupply: 500 });

    await nft.connect(marketplace).redeem(buyerA.address, 480, voucher, signature);

    await expect(
      nft.connect(marketplace).redeem(buyerB.address, 30, voucher, signature)
    ).to.be.revertedWith("DurchexNFT1155: exceeds max supply");

    // Exactly the remainder still works.
    await expect(nft.connect(marketplace).redeem(buyerB.address, 20, voucher, signature)).to.not
      .be.reverted;
    expect(await nft.minted(voucher.tokenId)).to.equal(500);
  });

  it("rejects redeem from anyone other than the marketplace address", async () => {
    const { nft, creator, buyerA, stranger } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator);

    await expect(
      nft.connect(stranger).redeem(buyerA.address, 5, voucher, signature)
    ).to.be.revertedWith("DurchexNFT1155: only marketplace");
  });

  it("rejects a voucher whose signature doesn't match its stated creator", async () => {
    const { nft, marketplace, creator, buyerA, stranger } = await loadFixture(deployFixture);
    const { voucher } = await buildVoucher(nft, creator);
    const forged = await buildVoucher(nft, stranger, { tokenId: voucher.tokenId });

    await expect(
      nft.connect(marketplace).redeem(buyerA.address, 5, voucher, forged.signature)
    ).to.be.revertedWith("DurchexNFT1155: invalid signature");
  });

  it("rejects a voucher past its deadline", async () => {
    const { nft, marketplace, creator, buyerA } = await loadFixture(deployFixture);
    const past = Math.floor(Date.now() / 1000) - 3600;
    const { voucher, signature } = await buildVoucher(nft, creator, { deadline: past });

    await expect(
      nft.connect(marketplace).redeem(buyerA.address, 5, voucher, signature)
    ).to.be.revertedWith("DurchexNFT1155: voucher expired");
  });

  it("lets a creator cancel an edition, blocking further redemptions", async () => {
    const { nft, marketplace, creator, buyerA, buyerB } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator, { maxSupply: 500 });

    await nft.connect(marketplace).redeem(buyerA.address, 10, voucher, signature);

    await expect(nft.connect(creator).cancelEdition(voucher, signature))
      .to.emit(nft, "EditionCancelled")
      .withArgs(creator.address, voucher.tokenId);

    await expect(
      nft.connect(marketplace).redeem(buyerB.address, 5, voucher, signature)
    ).to.be.revertedWith("DurchexNFT1155: edition cancelled");

    // Units already minted before cancellation are unaffected.
    expect(await nft.balanceOf(buyerA.address, voucher.tokenId)).to.equal(10);
  });

  it("rejects cancellation attempted by someone other than the creator", async () => {
    const { nft, creator, stranger } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator);

    await expect(nft.connect(stranger).cancelEdition(voucher, signature)).to.be.revertedWith(
      "DurchexNFT1155: only creator"
    );
  });

  it("sets per-token royalty from the voucher on first redemption", async () => {
    const { nft, marketplace, creator, buyerA } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator, { royaltyBps: 750 });

    await nft.connect(marketplace).redeem(buyerA.address, 1, voucher, signature);

    const [receiver, amount] = await nft.royaltyInfo(voucher.tokenId, ethers.parseEther("1"));
    expect(receiver).to.equal(creator.address);
    expect(amount).to.equal(ethers.parseEther("0.075"));
  });
});
