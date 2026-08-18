import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Minimal merkle helper matching OpenZeppelin's MerkleProof (sorted pairs,
// keccak256(abi.encodePacked(tokenId)) leaves).
function leafOf(tokenId: number | bigint) {
  return ethers.keccak256(ethers.solidityPacked(["uint256"], [tokenId]));
}
function hashPair(a: string, b: string) {
  return a <= b ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a]));
}
function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return ethers.ZeroHash;
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}
function merkleProof(leaves: string[], target: string): string[] {
  let level = [...leaves].sort();
  const proof: string[] = [];
  let idx = level.indexOf(target);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : null;
      if (i === idx || i + 1 === idx) {
        if (right !== null) proof.push(i === idx ? right : left);
        idx = next.length;
      }
      next.push(right !== null ? hashPair(left, right) : left);
    }
    level = next;
  }
  return proof;
}

describe("DurchexOffers (collection offers)", () => {
  async function deployFixture() {
    const [owner, feeRecipient, creator, buyer, seller, other] = await ethers.getSigners();

    // WETH stand-in: any ERC-20 works, the contract only needs approve/transferFrom.
    const Weth = await ethers.getContractFactory("MockWETH");
    const weth = await Weth.deploy();
    await weth.waitForDeployment();

    const DurchexNFT = await ethers.getContractFactory("DurchexNFT");
    const nft = await DurchexNFT.deploy();
    await nft.waitForDeployment();

    const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
    const marketplace = await DurchexMarketplace.deploy(feeRecipient.address);
    await marketplace.waitForDeployment();
    await nft.setMarketplace(await marketplace.getAddress());

    const DurchexOffers = await ethers.getContractFactory("DurchexOffers");
    const offers = await DurchexOffers.deploy(await weth.getAddress(), feeRecipient.address);
    await offers.waitForDeployment();

    // Mint tokens 1 and 2 to `seller` via the lazy-mint path, so they carry
    // a real 5% ERC-2981 royalty to `creator`.
    const chainId = (await ethers.provider.getNetwork()).chainId;
    for (const [i, tokenId] of [1, 2].entries()) {
      const voucher = {
        tokenId,
        uri: `internal://durchex/offers/${tokenId}.json`,
        minPrice: ethers.parseEther("0.01"),
        creator: creator.address,
        royaltyBps: 500,
        nonce: i,
        deadline: 0,
      };
      const signature = await creator.signTypedData(
        { name: "Durchex", version: "1", chainId, verifyingContract: await nft.getAddress() },
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
      await marketplace.connect(seller).buyLazy(await nft.getAddress(), voucher, signature, {
        value: ethers.parseEther("0.01"),
      });
    }

    await weth.mint(buyer.address, ethers.parseEther("100"));
    await weth.connect(buyer).approve(await offers.getAddress(), ethers.MaxUint256);
    await nft.connect(seller).setApprovalForAll(await offers.getAddress(), true);

    return { offers, weth, nft, owner, feeRecipient, creator, buyer, seller, other };
  }

  async function signOffer(
    offers: { getAddress(): Promise<string> },
    buyer: HardhatEthersSigner,
    o: {
      nft: string;
      isERC1155?: boolean;
      criteriaRoot?: string;
      pricePerItem: bigint;
      quantity: number;
      deadline?: number;
      nonce?: number;
    }
  ) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const offer = {
      nft: o.nft,
      isERC1155: o.isERC1155 ?? false,
      criteriaRoot: o.criteriaRoot ?? ethers.ZeroHash,
      pricePerItem: o.pricePerItem,
      quantity: o.quantity,
      deadline: o.deadline ?? 0,
      nonce: o.nonce ?? 1,
      buyer: buyer.address,
    };
    const signature = await buyer.signTypedData(
      { name: "DurchexOffers", version: "1", chainId, verifyingContract: await offers.getAddress() },
      {
        CollectionOffer: [
          { name: "nft", type: "address" },
          { name: "isERC1155", type: "bool" },
          { name: "criteriaRoot", type: "bytes32" },
          { name: "pricePerItem", type: "uint256" },
          { name: "quantity", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "buyer", type: "address" },
        ],
      },
      offer
    );
    return { offer, signature };
  }

  it("fills an offer: NFT to buyer, payment split between fee, royalty and seller", async () => {
    const { offers, weth, nft, feeRecipient, creator, buyer, seller } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { offer, signature } = await signOffer(offers, buyer, { nft: await nft.getAddress(), pricePerItem: price, quantity: 1 });

    await expect(offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, []))
      .to.emit(offers, "CollectionOfferFilled")
      .withArgs(await nft.getAddress(), 1, buyer.address, seller.address, 1, price, offer.nonce);

    expect(await nft.ownerOf(1)).to.equal(buyer.address);
    expect(await weth.balanceOf(feeRecipient.address)).to.equal((price * 1000n) / 10000n); // 10%
    expect(await weth.balanceOf(creator.address)).to.equal((price * 500n) / 10000n); // 5% royalty
    expect(await weth.balanceOf(seller.address)).to.equal(price - (price * 1500n) / 10000n);
  });

  it("cannot be filled beyond its quantity", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { offer, signature } = await signOffer(offers, buyer, { nft: await nft.getAddress(), pricePerItem: price, quantity: 1 });

    await offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, []);
    expect(await offers.offerFilled(buyer.address, offer.nonce)).to.equal(1);

    // Same offer, different token — quantity is exhausted.
    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, signature, 2, 1, [])
    ).to.be.revertedWith("DurchexOffers: exceeds offer quantity");
  });

  it("tracks partial fills across multiple sellers until exhausted", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { offer, signature } = await signOffer(offers, buyer, { nft: await nft.getAddress(), pricePerItem: price, quantity: 2 });

    await offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, []);
    expect(await offers.remainingQuantity(offer)).to.equal(1);

    await offers.connect(seller).acceptCollectionOffer(offer, signature, 2, 1, []);
    expect(await offers.remainingQuantity(offer)).to.equal(0);
  });

  it("rejects an expired offer", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    const past = Math.floor(Date.now() / 1000) - 3600;
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      pricePerItem: ethers.parseEther("1"),
      quantity: 1,
      deadline: past,
    });
    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, [])
    ).to.be.revertedWith("DurchexOffers: offer expired");
  });

  it("lets the buyer cancel, blocking further fills", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      pricePerItem: ethers.parseEther("1"),
      quantity: 5,
    });
    await expect(offers.connect(buyer).cancelOffer(offer.nonce))
      .to.emit(offers, "CollectionOfferCancelled")
      .withArgs(buyer.address, offer.nonce);

    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, [])
    ).to.be.revertedWith("DurchexOffers: offer cancelled");
    expect(await offers.remainingQuantity(offer)).to.equal(0);
  });

  it("rejects an offer not actually signed by the stated buyer", async () => {
    const { offers, nft, buyer, seller, other } = await loadFixture(deployFixture);
    const forged = await signOffer(offers, other, {
      nft: await nft.getAddress(),
      pricePerItem: ethers.parseEther("1"),
      quantity: 1,
    });
    const offer = { ...forged.offer, buyer: buyer.address };
    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, forged.signature, 1, 1, [])
    ).to.be.revertedWith("DurchexOffers: invalid signature");
  });

  it("enforces criteria: only tokens in the signed set can fill", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    // Buyer will only accept token 1 — token 2 is in the same NFT contract
    // but a different collection / not the right rarity.
    const leaves = [leafOf(1)];
    const root = merkleRoot(leaves);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      criteriaRoot: root,
      pricePerItem: ethers.parseEther("1"),
      quantity: 2,
    });

    // Token 2 is ineligible even with a well-formed (but wrong) proof.
    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, signature, 2, 1, merkleProof(leaves, leafOf(1)))
    ).to.be.revertedWith("DurchexOffers: token not eligible for this offer");

    // Token 1 with its real proof succeeds.
    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, merkleProof(leaves, leafOf(1)))
    ).to.not.be.reverted;
    expect(await nft.ownerOf(1)).to.equal(buyer.address);
  });

  it("enforces criteria across a multi-token set", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    const leaves = [leafOf(1), leafOf(2), leafOf(999)];
    const root = merkleRoot(leaves);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      criteriaRoot: root,
      pricePerItem: ethers.parseEther("1"),
      quantity: 2,
    });
    await expect(offers.connect(seller).acceptCollectionOffer(offer, signature, 2, 1, merkleProof(leaves, leafOf(2))))
      .to.not.be.reverted;
    expect(await nft.ownerOf(2)).to.equal(buyer.address);
  });

  // An offer on one specific NFT is just a collection offer whose eligible
  // set has a single member: the root is the leaf itself and the proof is
  // empty. This is what lets per-item NFT offers reuse this contract
  // unchanged, so it's worth pinning down explicitly.
  it("supports a single-token offer (an NFT offer) with root = leaf and an empty proof", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    const price = ethers.parseEther("1");
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      criteriaRoot: leafOf(1), // single-leaf tree
      pricePerItem: price,
      quantity: 1,
    });

    // The one token it names fills it, with no proof needed.
    await expect(offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, [])).to.not.be.reverted;
    expect(await nft.ownerOf(1)).to.equal(buyer.address);
  });

  it("a single-token offer cannot be filled by any other token", async () => {
    const { offers, nft, buyer, seller } = await loadFixture(deployFixture);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      criteriaRoot: leafOf(1),
      pricePerItem: ethers.parseEther("1"),
      quantity: 1,
    });
    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, signature, 2, 1, [])
    ).to.be.revertedWith("DurchexOffers: token not eligible for this offer");
  });

  it("refuses to let a buyer fill their own offer", async () => {
    const { offers, nft, buyer } = await loadFixture(deployFixture);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      pricePerItem: ethers.parseEther("1"),
      quantity: 1,
    });
    await expect(
      offers.connect(buyer).acceptCollectionOffer(offer, signature, 1, 1, [])
    ).to.be.revertedWith("DurchexOffers: cannot fill your own offer");
  });

  it("fails when the seller doesn't actually own the token", async () => {
    const { offers, nft, buyer, other } = await loadFixture(deployFixture);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      pricePerItem: ethers.parseEther("1"),
      quantity: 1,
    });
    // `other` owns nothing — the ERC-721 transfer itself rejects this.
    await expect(offers.connect(other).acceptCollectionOffer(offer, signature, 1, 1, [])).to.be.reverted;
  });

  it("fails when the buyer hasn't approved enough payment token", async () => {
    const { offers, weth, nft, buyer, seller } = await loadFixture(deployFixture);
    await weth.connect(buyer).approve(await offers.getAddress(), 0);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      pricePerItem: ethers.parseEther("1"),
      quantity: 1,
    });
    await expect(offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, [])).to.be.reverted;
  });

  it("honours pause, and the owner-only fee levers", async () => {
    const { offers, nft, buyer, seller, other } = await loadFixture(deployFixture);
    const { offer, signature } = await signOffer(offers, buyer, {
      nft: await nft.getAddress(),
      pricePerItem: ethers.parseEther("1"),
      quantity: 1,
    });
    await offers.pause();
    await expect(
      offers.connect(seller).acceptCollectionOffer(offer, signature, 1, 1, [])
    ).to.be.revertedWithCustomError(offers, "EnforcedPause");
    await offers.unpause();

    await expect(offers.setPlatformFee(2001)).to.be.revertedWith("DurchexOffers: fee exceeds ceiling");
    await expect(offers.connect(other).setPlatformFee(100)).to.be.reverted;
    await expect(offers.renounceOwnership()).to.be.revertedWith("DurchexOffers: renounce disabled");
  });
});
