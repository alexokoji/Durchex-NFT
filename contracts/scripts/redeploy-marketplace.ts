import { ethers, network } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Redeploys just DurchexMarketplace (e.g. after a PLATFORM_FEE_BPS change)
// and rewires the existing DurchexNFT to trust it — no need to redeploy
// DurchexNFT itself since nothing about it changed.
async function main() {
  const [deployer] = await ethers.getSigners();
  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const existing = existsSync(deploymentsPath) ? JSON.parse(readFileSync(deploymentsPath, "utf-8")) : {};
  const current = existing[network.name];
  if (!current?.DurchexNFT) throw new Error(`No existing DurchexNFT recorded for network "${network.name}"`);

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || current.feeRecipient || deployer.address;
  console.log(`Redeploying DurchexMarketplace on "${network.name}" as ${deployer.address}`);
  console.log(`Fee recipient: ${feeRecipient}`);
  console.log(`Existing DurchexNFT: ${current.DurchexNFT}`);

  const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
  const marketplace = await DurchexMarketplace.deploy(feeRecipient);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`New DurchexMarketplace deployed to ${marketplaceAddress}`);

  const nft = await ethers.getContractAt("DurchexNFT", current.DurchexNFT);
  const tx = await nft.setMarketplace(marketplaceAddress);
  await tx.wait();
  console.log(`DurchexNFT.marketplace updated to ${marketplaceAddress}`);

  if (current.DurchexNFT1155) {
    const nft1155 = await ethers.getContractAt("DurchexNFT1155", current.DurchexNFT1155);
    const tx1155 = await nft1155.setMarketplace(marketplaceAddress);
    await tx1155.wait();
    console.log(`DurchexNFT1155.marketplace updated to ${marketplaceAddress}`);
  }

  existing[network.name] = { ...current, DurchexMarketplace: marketplaceAddress, feeRecipient, deployedAt: new Date().toISOString() };
  writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`Recorded in ${deploymentsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
