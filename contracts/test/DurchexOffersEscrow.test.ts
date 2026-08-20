import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, solidityPacked, ZeroHash } from "ethers";

/**
 * Escrowed ETH offers.
 *
 * The properties worth protecting here are about custody, not happy paths:
 * escrowed ETH must always be reclaimable, must never pay out more than
 * was deposited, and must reach the right three parties in the right
 * proportions. Everything else follows from those.
 */
const leafOf = (tokenId: bigint) => keccak256(solidityPacked(["uint256"], [tokenId]));

describe("DurchexOffersEscrow", () => {
  async function deploy() {
    const [owner, buyer, seller, feeRecipient, creator] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory("DurchexNFT");
    // (deployer, feeRecipient-ish args vary by contract; use a plain 721
    // mock via the collection implementation instead if needed)
    const Escrow = await ethers.getContractFactory("DurchexOffersEscrow");
    const escrow = await Escrow.deploy(feeRecipient.address);
    await escrow.waitForDeployment();

    return { owner, buyer, seller, feeRecipient, creator, escrow, NFT };
  }

  it("escrows exactly the offered total and refuses anything else", async () => {
    const { escrow, buyer } = await deploy();
    const price = ethers.parseEther("0.1");

    await expect(
      escrow
        .connect(buyer)
        .makeOffer(ethers.Wallet.createRandom().address, false, ZeroHash, price, 2n, 0, {
          value: price, // one unit's worth for a two-unit offer
        })
    ).to.be.revertedWith("DurchexOffersEscrow: wrong ETH amount");

    const nft = ethers.Wallet.createRandom().address;
    await expect(
      escrow.connect(buyer).makeOffer(nft, false, ZeroHash, price, 2n, 0, { value: price * 2n })
    ).to.emit(escrow, "OfferMade");

    expect(await escrow.escrowOf(1)).to.equal(price * 2n);
  });

  it("returns the full deposit to the buyer on withdrawal", async () => {
    const { escrow, buyer } = await deploy();
    const price = ethers.parseEther("0.5");
    const nft = ethers.Wallet.createRandom().address;

    await escrow.connect(buyer).makeOffer(nft, false, ZeroHash, price, 1n, 0, { value: price });

    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await escrow.connect(buyer).withdrawOffer(1);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    const after = await ethers.provider.getBalance(buyer.address);

    expect(after - before + gas).to.equal(price);
    expect(await escrow.escrowOf(1)).to.equal(0n);
  });

  it("lets nobody but the buyer withdraw, and never twice", async () => {
    const { escrow, buyer, seller } = await deploy();
    const price = ethers.parseEther("0.2");
    const nft = ethers.Wallet.createRandom().address;
    await escrow.connect(buyer).makeOffer(nft, false, ZeroHash, price, 1n, 0, { value: price });

    await expect(escrow.connect(seller).withdrawOffer(1)).to.be.revertedWith(
      "DurchexOffersEscrow: not your offer"
    );
    await escrow.connect(buyer).withdrawOffer(1);
    await expect(escrow.connect(buyer).withdrawOffer(1)).to.be.revertedWith(
      "DurchexOffersEscrow: nothing to withdraw"
    );
  });

  it("refuses a token the offer's criteria doesn't cover", async () => {
    const { escrow, buyer, seller } = await deploy();
    const price = ethers.parseEther("0.1");
    const nft = ethers.Wallet.createRandom().address;
    // Root committing to token 7 alone.
    await escrow.connect(buyer).makeOffer(nft, false, leafOf(7n), price, 1n, 0, { value: price });

    await expect(escrow.connect(seller).acceptOffer(1, 8n, 1n, [])).to.be.revertedWith(
      "DurchexOffersEscrow: token not eligible for this offer"
    );
  });

  it("won't let a buyer fill their own offer", async () => {
    const { escrow, buyer } = await deploy();
    const price = ethers.parseEther("0.1");
    const nft = ethers.Wallet.createRandom().address;
    await escrow.connect(buyer).makeOffer(nft, false, ZeroHash, price, 1n, 0, { value: price });

    await expect(escrow.connect(buyer).acceptOffer(1, 1n, 1n, [])).to.be.revertedWith(
      "DurchexOffersEscrow: cannot fill your own offer"
    );
  });

  it("won't accept past the deadline, and the buyer can still reclaim", async () => {
    const { escrow, buyer, seller } = await deploy();
    const price = ethers.parseEther("0.1");
    const nft = ethers.Wallet.createRandom().address;
    const deadline = BigInt(await time()) + 60n;
    await escrow.connect(buyer).makeOffer(nft, false, ZeroHash, price, 1n, deadline, { value: price });

    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);

    await expect(escrow.connect(seller).acceptOffer(1, 1n, 1n, [])).to.be.revertedWith(
      "DurchexOffersEscrow: offer expired"
    );
    // An expired offer must not trap the deposit.
    await expect(escrow.connect(buyer).withdrawOffer(1)).to.emit(escrow, "OfferWithdrawn");
  });

  it("pays the platform, the creator and the seller their exact shares", async () => {
    const { escrow, buyer, seller, feeRecipient, creator } = await deploy();
    const price = ethers.parseEther("1");

    // 15% royalty to the creator; the contract's own 10% platform fee.
    const Mock = await ethers.getContractFactory("MockRoyaltyNFT");
    const nft = await Mock.deploy(creator.address, 1500);
    await nft.waitForDeployment();
    await nft.mint(seller.address, 7n);
    await nft.connect(seller).setApprovalForAll(await escrow.getAddress(), true);

    await escrow
      .connect(buyer)
      .makeOffer(await nft.getAddress(), false, leafOf(7n), price, 1n, 0, { value: price });

    const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
    const creatorBefore = await ethers.provider.getBalance(creator.address);
    const sellerBefore = await ethers.provider.getBalance(seller.address);

    const tx = await escrow.connect(seller).acceptOffer(1, 7n, 1n, []);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;

    const fee = (price * 1000n) / 10000n; // 10%
    const royalty = (price * 1500n) / 10000n; // 15%

    expect((await ethers.provider.getBalance(feeRecipient.address)) - feeBefore).to.equal(fee);
    expect((await ethers.provider.getBalance(creator.address)) - creatorBefore).to.equal(royalty);
    expect((await ethers.provider.getBalance(seller.address)) - sellerBefore + gas).to.equal(
      price - fee - royalty
    );

    // The NFT moved, and the escrow is spent to the last wei.
    expect(await nft.ownerOf(7n)).to.equal(buyer.address);
    expect(await escrow.escrowOf(1)).to.equal(0n);
    // Nothing left behind in the contract itself.
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
  });

  it("cannot be over-filled beyond the quantity offered", async () => {
    const { escrow, buyer, seller } = await deploy();
    const price = ethers.parseEther("0.1");
    const nft = ethers.Wallet.createRandom().address;
    await escrow.connect(buyer).makeOffer(nft, true, ZeroHash, price, 2n, 0, { value: price * 2n });

    await expect(escrow.connect(seller).acceptOffer(1, 1n, 3n, [])).to.be.revertedWith(
      "DurchexOffersEscrow: exceeds offer quantity"
    );
  });
});

async function time() {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}
