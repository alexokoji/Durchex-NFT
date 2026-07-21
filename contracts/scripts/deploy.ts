import { ethers, network } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Deploys DurchexNFT + DurchexMarketplace, wires the NFT contract's
// marketplace address, and records the result in deployments.json — the app
// (lib/web3/config.ts) reads this file to know which addresses to talk to
// per network. Fee recipient defaults to the deployer; override with
// FEE_RECIPIENT_ADDRESS.
async function main() {
  const [deployer] = await ethers.getSigners();
  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || deployer.address;

  console.log(`Deploying to "${network.name}" as ${deployer.address}`);
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

  const setMarketplaceTx = await nft.setMarketplace(marketplaceAddress);
  await setMarketplaceTx.wait();
  console.log(`DurchexNFT.marketplace set to ${marketplaceAddress}`);

  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const existing = existsSync(deploymentsPath)
    ? JSON.parse(readFileSync(deploymentsPath, "utf-8"))
    : {};

  existing[network.name] = {
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
