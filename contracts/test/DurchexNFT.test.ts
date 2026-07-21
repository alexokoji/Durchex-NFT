import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { DurchexNFT } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function buildVoucher(
  nft: DurchexNFT,
  creator: HardhatEthersSigner,
  overrides: Partial<{
    tokenId: number;
    uri: string;
    minPrice: bigint;
    royaltyBps: number;
    nonce: number;
  }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const voucher = {
    tokenId: overrides.tokenId ?? 1,
    uri: overrides.uri ?? "internal://durchex/test-collection/1.json",
    minPrice: overrides.minPrice ?? ethers.parseEther("0.5"),
    creator: creator.address,
    royaltyBps: overrides.royaltyBps ?? 500,
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

describe("DurchexNFT", () => {
  async function deployFixture() {
    const [owner, marketplace, creator, buyer, stranger] = await ethers.getSigners();

    const DurchexNFT = await ethers.getContractFactory("DurchexNFT");
    const nft = await DurchexNFT.deploy();
    await nft.waitForDeployment();
    await nft.connect(owner).setMarketplace(marketplace.address);

    return { nft, owner, marketplace, creator, buyer, stranger };
  }

  it("redeems a valid voucher: mints to creator then transfers to buyer", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator);

    await expect(nft.connect(marketplace).redeem(buyer.address, voucher, signature))
      .to.emit(nft, "Transfer") // mint: 0x0 -> creator
      .withArgs(ethers.ZeroAddress, creator.address, voucher.tokenId)
      .and.to.emit(nft, "Transfer") // then: creator -> buyer
      .withArgs(creator.address, buyer.address, voucher.tokenId);

    expect(await nft.ownerOf(voucher.tokenId)).to.equal(buyer.address);
    expect(await nft.tokenURI(voucher.tokenId)).to.equal(voucher.uri);
    expect(await nft.minted(voucher.tokenId)).to.equal(true);
    expect(await nft.nonces(creator.address)).to.equal(1);

    const [royaltyReceiver, royaltyAmount] = await nft.royaltyInfo(
      voucher.tokenId,
      ethers.parseEther("1")
    );
    expect(royaltyReceiver).to.equal(creator.address);
    expect(royaltyAmount).to.equal(ethers.parseEther("0.05")); // 5%
  });

  it("rejects redeem from anyone other than the marketplace address", async () => {
    const { nft, creator, buyer, stranger } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator);

    await expect(
      nft.connect(stranger).redeem(buyer.address, voucher, signature)
    ).to.be.revertedWith("DurchexNFT: only marketplace");
  });

  it("rejects a replayed voucher (same tokenId redeemed twice)", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);
    const { voucher, signature } = await buildVoucher(nft, creator);

    await nft.connect(marketplace).redeem(buyer.address, voucher, signature);

    await expect(
      nft.connect(marketplace).redeem(buyer.address, voucher, signature)
    ).to.be.revertedWith("DurchexNFT: already minted");
  });

  it("rejects a voucher signed with a stale nonce", async () => {
    const { nft, marketplace, creator, buyer } = await loadFixture(deployFixture);

    // First voucher consumes nonce 0.
    const first = await buildVoucher(nft, creator, { tokenId: 1, nonce: 0 });
    await nft.connect(marketplace).redeem(buyer.address, first.voucher, first.signature);

    // Second voucher reuses nonce 0 instead of the now-required 1.
    const stale = await buildVoucher(nft, creator, { tokenId: 2, nonce: 0 });
    await expect(
      nft.connect(marketplace).redeem(buyer.address, stale.voucher, stale.signature)
    ).to.be.revertedWith("DurchexNFT: bad nonce");
  });

  it("rejects a voucher whose signature doesn't match its stated creator", async () => {
    const { nft, marketplace, creator, buyer, stranger } = await loadFixture(deployFixture);
    const { voucher } = await buildVoucher(nft, creator);

    // Signed by `stranger`, but the voucher claims `creator` as the signer.
    const forged = await buildVoucher(nft, stranger, { tokenId: voucher.tokenId });

    await expect(
      nft.connect(marketplace).redeem(buyer.address, voucher, forged.signature)
    ).to.be.revertedWith("DurchexNFT: invalid signature");
  });

  it("only the owner can update the marketplace address", async () => {
    const { nft, stranger } = await loadFixture(deployFixture);
    await expect(nft.connect(stranger).setMarketplace(stranger.address)).to.be.reverted;
  });
});
