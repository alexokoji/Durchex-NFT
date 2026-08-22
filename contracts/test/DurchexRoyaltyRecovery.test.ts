import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { DurchexNFT1155 } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Redirecting a royalty away from a receiver nobody controls any more.
 *
 * ERC-2981 stamps the royalty receiver into the token at mint, and until
 * now nothing could change it. That is the right default right up until the
 * receiving key is compromised, at which point every future sale pays an
 * attacker and there is no recourse at all — which is exactly what happened
 * to a creator wallet on this deployment, after it was delegated (EIP-7702)
 * to a contract that sweeps anything it receives.
 *
 * Two independent repairs are covered here, because they reach different
 * places. The NFT-level setter changes what ERC-2981 itself reports, so it
 * also fixes venues outside Durchex; the marketplace and escrow overrides
 * fix settlement here without touching the token, which is the only option
 * for tokens on a contract deployed before the setter existed.
 */
async function buildVoucher(
  nft: DurchexNFT1155,
  creator: HardhatEthersSigner,
  overrides: Partial<{ tokenId: number; minPrice: bigint; royaltyBps: number; maxSupply: number; nonce: number }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const voucher = {
    tokenId: overrides.tokenId ?? 1001,
    uri: "internal://durchex/recovery/1001.json",
    minPrice: overrides.minPrice ?? ethers.parseEther("0.05"),
    creator: creator.address,
    royaltyBps: overrides.royaltyBps ?? 1500,
    maxSupply: overrides.maxSupply ?? 500,
    nonce: overrides.nonce ?? 1,
    deadline: 0,
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
  return { voucher, signature: await creator.signTypedData(domain, types, voucher) };
}

async function buildListing1155(
  marketplace: { getAddress(): Promise<string> },
  seller: HardhatEthersSigner,
  overrides: Partial<{ nft: string; tokenId: number; quantity: number; pricePerUnit: bigint; nonce: number }> = {}
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const listing = {
    nft: overrides.nft ?? ethers.ZeroAddress,
    tokenId: overrides.tokenId ?? 1001,
    seller: seller.address,
    buyer: ethers.ZeroAddress,
    quantity: overrides.quantity ?? 10,
    pricePerUnit: overrides.pricePerUnit ?? ethers.parseEther("0.1"),
    deadline: 0,
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
  return { listing, signature: await seller.signTypedData(domain, types, listing) };
}

describe("Royalty recovery after a compromised creator key", () => {
  async function deployFixture() {
    const [owner, feeRecipient, compromised, holder, buyer, rescue] = await ethers.getSigners();

    const nft = await (await ethers.getContractFactory("DurchexNFT1155")).deploy();
    await nft.waitForDeployment();
    const marketplace = await (await ethers.getContractFactory("DurchexMarketplace")).deploy(feeRecipient.address);
    await marketplace.waitForDeployment();
    await nft.connect(owner).setMarketplace(await marketplace.getAddress());

    // `compromised` stands in for the creator wallet whose key is gone: it
    // minted the edition, so it is the receiver ERC-2981 will keep naming.
    const { voucher, signature } = await buildVoucher(nft, compromised, { royaltyBps: 1500 });
    await marketplace.connect(holder).buyLazy1155(await nft.getAddress(), 100, voucher, signature, {
      value: voucher.minPrice * 100n,
    });
    await nft.connect(holder).setApprovalForAll(await marketplace.getAddress(), true);

    return { nft, marketplace, owner, feeRecipient, compromised, holder, buyer, rescue, voucher };
  }

  it("pays the compromised address by default — the problem being fixed", async () => {
    const { nft, marketplace, compromised, holder, buyer, voucher } = await loadFixture(deployFixture);
    const price = ethers.parseEther("0.1");
    const { listing, signature } = await buildListing1155(marketplace, holder, {
      nft: await nft.getAddress(),
      tokenId: voucher.tokenId,
      quantity: 10,
      pricePerUnit: price,
    });

    const before = await ethers.provider.getBalance(compromised.address);
    await marketplace.connect(buyer).buyListed1155(listing, 10, signature, { value: price * 10n });

    const total = price * 10n;
    expect(await ethers.provider.getBalance(compromised.address)).to.equal(before + (total * 1500n) / 10000n);
  });

  it("sends the royalty to the rescue wallet once the marketplace override is set", async () => {
    const { nft, marketplace, owner, compromised, holder, buyer, rescue, feeRecipient, voucher } =
      await loadFixture(deployFixture);
    const price = ethers.parseEther("0.1");

    await expect(
      marketplace.connect(owner).setRoyaltyReceiverOverride(await nft.getAddress(), voucher.tokenId, rescue.address)
    )
      .to.emit(marketplace, "RoyaltyReceiverOverridden")
      .withArgs(await nft.getAddress(), voucher.tokenId, rescue.address);

    const { listing, signature } = await buildListing1155(marketplace, holder, {
      nft: await nft.getAddress(),
      tokenId: voucher.tokenId,
      quantity: 10,
      pricePerUnit: price,
    });

    const compromisedBefore = await ethers.provider.getBalance(compromised.address);
    const rescueBefore = await ethers.provider.getBalance(rescue.address);
    const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
    const holderBefore = await ethers.provider.getBalance(holder.address);

    await marketplace.connect(buyer).buyListed1155(listing, 10, signature, { value: price * 10n });

    const total = price * 10n;
    const fee = (total * 1000n) / 10000n;
    const royalty = (total * 1500n) / 10000n;

    // Not a wei to the old address, and the split is otherwise identical —
    // the override moves who is paid, never how much.
    expect(await ethers.provider.getBalance(compromised.address)).to.equal(compromisedBefore);
    expect(await ethers.provider.getBalance(rescue.address)).to.equal(rescueBefore + royalty);
    expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(feeBefore + fee);
    expect(await ethers.provider.getBalance(holder.address)).to.equal(holderBefore + (total - fee - royalty));
  });

  it("goes back to the ERC-2981 receiver when the override is cleared", async () => {
    const { nft, marketplace, owner, compromised, holder, buyer, rescue, voucher } = await loadFixture(deployFixture);
    const price = ethers.parseEther("0.1");
    const nftAddress = await nft.getAddress();

    await marketplace.connect(owner).setRoyaltyReceiverOverride(nftAddress, voucher.tokenId, rescue.address);
    await marketplace.connect(owner).setRoyaltyReceiverOverride(nftAddress, voucher.tokenId, ethers.ZeroAddress);

    const { listing, signature } = await buildListing1155(marketplace, holder, {
      nft: nftAddress,
      tokenId: voucher.tokenId,
      quantity: 10,
      pricePerUnit: price,
    });

    const before = await ethers.provider.getBalance(compromised.address);
    await marketplace.connect(buyer).buyListed1155(listing, 10, signature, { value: price * 10n });
    expect(await ethers.provider.getBalance(compromised.address)).to.equal(before + (price * 10n * 1500n) / 10000n);
  });

  it("leaves the override to the owner alone", async () => {
    const { nft, marketplace, holder, rescue, voucher } = await loadFixture(deployFixture);
    await expect(
      marketplace.connect(holder).setRoyaltyReceiverOverride(await nft.getAddress(), voucher.tokenId, rescue.address)
    ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
  });

  it("only redirects the token it names", async () => {
    const { nft, marketplace, owner, rescue, voucher } = await loadFixture(deployFixture);
    const nftAddress = await nft.getAddress();
    await marketplace.connect(owner).setRoyaltyReceiverOverride(nftAddress, voucher.tokenId, rescue.address);

    expect(await marketplace.royaltyReceiverOverride(nftAddress, voucher.tokenId)).to.equal(rescue.address);
    expect(await marketplace.royaltyReceiverOverride(nftAddress, 9999)).to.equal(ethers.ZeroAddress);
  });

  describe("the NFT-level setter, which also fixes outside venues", () => {
    it("moves the receiver ERC-2981 reports while keeping the rate", async () => {
      const { nft, owner, compromised, rescue, voucher } = await loadFixture(deployFixture);

      const [receiverBefore, amountBefore] = await nft.royaltyInfo(voucher.tokenId, ethers.parseEther("1"));
      expect(receiverBefore).to.equal(compromised.address);

      await expect(nft.connect(owner).setTokenRoyaltyReceiver(voucher.tokenId, rescue.address))
        .to.emit(nft, "TokenRoyaltyReceiverUpdated")
        .withArgs(voucher.tokenId, rescue.address);

      const [receiverAfter, amountAfter] = await nft.royaltyInfo(voucher.tokenId, ethers.parseEther("1"));
      expect(receiverAfter).to.equal(rescue.address);
      expect(amountAfter).to.equal(amountBefore);
    });

    it("refuses a token that has never been minted", async () => {
      const { nft, owner, rescue } = await loadFixture(deployFixture);
      await expect(nft.connect(owner).setTokenRoyaltyReceiver(4242, rescue.address)).to.be.revertedWith(
        "DurchexNFT1155: token not minted"
      );
    });

    it("refuses the zero address, which would silently waive the royalty", async () => {
      const { nft, owner, voucher } = await loadFixture(deployFixture);
      await expect(
        nft.connect(owner).setTokenRoyaltyReceiver(voucher.tokenId, ethers.ZeroAddress)
      ).to.be.revertedWith("DurchexNFT1155: zero receiver");
    });

    it("is owner-only, so a holder cannot point a royalty at themselves", async () => {
      const { nft, holder, voucher } = await loadFixture(deployFixture);
      await expect(
        nft.connect(holder).setTokenRoyaltyReceiver(voucher.tokenId, holder.address)
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    });
  });
});
