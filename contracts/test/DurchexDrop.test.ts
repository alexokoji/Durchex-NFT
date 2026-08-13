import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("DurchexDrop", () => {
  async function deployFixture() {
    const [owner, holder, outsider, recipient] = await ethers.getSigners();
    const Drop = await ethers.getContractFactory("DurchexDrop");
    const drop = await Drop.deploy("Durchex Launch", "DRXL", 10, "ipfs://collection", recipient.address, owner.address, 500);
    const Pass = await ethers.getContractFactory("DurchexPass");
    const pass = await Pass.deploy();
    await pass.createPass(holder.address, 1, "ipfs://pass/1.json");
    const now = await time.latest();
    return { drop, pass, owner, holder, outsider, recipient, now };
  }

  it("mints within an active public phase and applies a per-wallet limit", async () => {
    const { drop, outsider, now } = await loadFixture(deployFixture);
    await drop.configurePhase(2, { enabled: true, startsAt: now, endsAt: 0, priceWei: ethers.parseEther("0.1"), allocation: 5, minted: 0, walletLimit: 2, merkleRoot: ethers.ZeroHash, passContract: ethers.ZeroAddress, passId: 0 });
    await expect(drop.connect(outsider).mint(2, 2, [], { value: ethers.parseEther("0.2") })).to.emit(drop, "DropMinted").withArgs(2, outsider.address, 1, 2, ethers.parseEther("0.2"));
    expect(await drop.ownerOf(1)).to.equal(outsider.address);
    await expect(drop.connect(outsider).mint(2, 1, [], { value: ethers.parseEther("0.1") })).to.be.revertedWith("DurchexDrop: wallet limit");
  });

  it("enforces allowlist proof and an optional NFT Pass gate", async () => {
    const { drop, pass, holder, outsider, now } = await loadFixture(deployFixture);
    const leaf = ethers.keccak256(ethers.solidityPacked(["address"], [holder.address]));
    await drop.configurePhase(0, { enabled: true, startsAt: now, endsAt: 0, priceWei: 0, allocation: 0, minted: 0, walletLimit: 0, merkleRoot: leaf, passContract: await pass.getAddress(), passId: 1 });
    await drop.connect(holder).mint(0, 1, []);
    await expect(drop.connect(outsider).mint(0, 1, [])).to.be.revertedWith("DurchexDrop: not allowlisted");
  });

  it("enforces phase allocation, total supply, and the exact ETH price", async () => {
    const { drop, outsider, now } = await loadFixture(deployFixture);
    await drop.configurePhase(2, { enabled: true, startsAt: now, endsAt: 0, priceWei: ethers.parseEther("0.01"), allocation: 3, minted: 0, walletLimit: 0, merkleRoot: ethers.ZeroHash, passContract: ethers.ZeroAddress, passId: 0 });
    await expect(drop.connect(outsider).mint(2, 1, [], { value: 0 })).to.be.revertedWith("DurchexDrop: incorrect payment");
    await drop.connect(outsider).mint(2, 3, [], { value: ethers.parseEther("0.03") });
    await expect(drop.connect(outsider).mint(2, 1, [], { value: ethers.parseEther("0.01") })).to.be.revertedWith("DurchexDrop: phase sold out");
  });

  it("does not allow a phase update to erase already-minted allocation accounting", async () => {
    const { drop, outsider, now } = await loadFixture(deployFixture);
    await drop.configurePhase(2, { enabled: true, startsAt: now, endsAt: 0, priceWei: 0, allocation: 2, minted: 0, walletLimit: 0, merkleRoot: ethers.ZeroHash, passContract: ethers.ZeroAddress, passId: 0 });
    await drop.connect(outsider).mint(2, 1, []);
    await expect(drop.configurePhase(2, { enabled: true, startsAt: now, endsAt: 0, priceWei: 0, allocation: 0, minted: 0, walletLimit: 0, merkleRoot: ethers.ZeroHash, passContract: ethers.ZeroAddress, passId: 0 })).to.not.be.reverted;
    const phase = await drop.phases(2);
    expect(phase.minted).to.equal(1);
  });
});
