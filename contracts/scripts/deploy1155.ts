import { ethers, network } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Deploys DurchexNFT1155 only and wires it to the marketplace address
// already recorded in deployments.json for this network — does not touch
// the existing DurchexNFT/DurchexMarketplace deployment.
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying DurchexNFT1155 to "${network.name}" as ${deployer.address}`);

  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const existing = existsSync(deploymentsPath)
    ? JSON.parse(readFileSync(deploymentsPath, "utf-8"))
    : {};
  const current = existing[network.name];
  if (!current?.DurchexMarketplace) {
    throw new Error(`No existing DurchexMarketplace recorded for "${network.name}" in deployments.json`);
  }

  const DurchexNFT1155 = await ethers.getContractFactory("DurchexNFT1155");
  const nft1155 = await DurchexNFT1155.deploy();
  await nft1155.waitForDeployment();
  const nft1155Address = await nft1155.getAddress();
  console.log(`DurchexNFT1155 deployed to ${nft1155Address}`);

  const setMarketplaceTx = await nft1155.setMarketplace(current.DurchexMarketplace);
  await setMarketplaceTx.wait();
  console.log(`DurchexNFT1155.marketplace set to ${current.DurchexMarketplace}`);

  existing[network.name] = { ...current, DurchexNFT1155: nft1155Address };
  writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`Recorded deployment in ${deploymentsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
