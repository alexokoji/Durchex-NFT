import { ethers, network } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Redeploys DurchexNFT + DurchexMarketplace fresh (the existing DurchexNFT
// on this network turned out to be owned by a different key than the one
// configured as DEPLOYER_PRIVATE_KEY, so it can't be rewired to trust a new
// marketplace — see the ERC-1155 deploy investigation) and rewires the
// existing DurchexNFT1155 to the new marketplace too. Does not touch
// DurchexPass.
async function main() {
  const [deployer] = await ethers.getSigners();
  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const existing = existsSync(deploymentsPath) ? JSON.parse(readFileSync(deploymentsPath, "utf-8")) : {};
  const current = existing[network.name] ?? {};

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || deployer.address;
  console.log(`Redeploying DurchexNFT + DurchexMarketplace on "${network.name}" as ${deployer.address}`);
  console.log(`Fee recipient: ${feeRecipient}`);

  const DurchexNFT = await ethers.getContractFactory("DurchexNFT");
  const nft = await DurchexNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`DurchexNFT deployed to ${nftAddress}`);

  const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
  const marketplace = await DurchexMarketplace.deploy(feeRecipient);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`DurchexMarketplace deployed to ${marketplaceAddress}`);

  const tx = await nft.setMarketplace(marketplaceAddress);
  await tx.wait();
  console.log(`DurchexNFT.marketplace set to ${marketplaceAddress}`);

  if (current.DurchexNFT1155) {
    const nft1155 = await ethers.getContractAt("DurchexNFT1155", current.DurchexNFT1155);
    const tx1155 = await nft1155.setMarketplace(marketplaceAddress);
    await tx1155.wait();
    console.log(`DurchexNFT1155.marketplace updated to ${marketplaceAddress}`);
  }

  existing[network.name] = {
    ...current,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    DurchexNFT: nftAddress,
    DurchexMarketplace: marketplaceAddress,
    feeRecipient,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`Recorded deployment in ${deploymentsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
