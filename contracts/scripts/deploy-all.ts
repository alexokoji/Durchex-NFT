import { ethers, network, run } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Full clean deployment: DurchexNFT (721) + DurchexNFT1155 + DurchexMarketplace,
// with both NFT contracts wired to trust the marketplace. Used for bringing a
// new network live (e.g. mainnet). Records addresses in deployments.json and
// attempts Etherscan verification.
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const balance = await ethers.provider.getBalance(deployer.address);

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || deployer.address;

  console.log(`Network:       ${network.name} (chainId ${chainId})`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Balance:       ${ethers.formatEther(balance)} ETH`);
  console.log(`Fee recipient: ${feeRecipient}`);
  console.log("");

  const DurchexNFT = await ethers.getContractFactory("DurchexNFT");
  const nft = await DurchexNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`DurchexNFT          -> ${nftAddress}`);

  const DurchexNFT1155 = await ethers.getContractFactory("DurchexNFT1155");
  const nft1155 = await DurchexNFT1155.deploy();
  await nft1155.waitForDeployment();
  const nft1155Address = await nft1155.getAddress();
  console.log(`DurchexNFT1155      -> ${nft1155Address}`);

  const DurchexMarketplace = await ethers.getContractFactory("DurchexMarketplace");
  const marketplace = await DurchexMarketplace.deploy(feeRecipient);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`DurchexMarketplace  -> ${marketplaceAddress}`);

  await (await nft.setMarketplace(marketplaceAddress)).wait();
  console.log(`DurchexNFT.marketplace     set`);
  await (await nft1155.setMarketplace(marketplaceAddress)).wait();
  console.log(`DurchexNFT1155.marketplace set`);

  // Read the live values back rather than assuming the constructor did what
  // we expect — this is the last chance to catch a misconfigured deployment
  // before real users transact against it.
  const [feeBps, maxFeeBps, liveFeeRecipient, owner, paused] = await Promise.all([
    marketplace.platformFeeBps(),
    marketplace.MAX_PLATFORM_FEE_BPS(),
    marketplace.feeRecipient(),
    marketplace.owner(),
    marketplace.paused(),
  ]);
  console.log("\n--- Post-deploy verification ---");
  console.log(`platformFeeBps:        ${feeBps} (${Number(feeBps) / 100}%)`);
  console.log(`MAX_PLATFORM_FEE_BPS:  ${maxFeeBps} (${Number(maxFeeBps) / 100}%)`);
  console.log(`feeRecipient:          ${liveFeeRecipient}`);
  console.log(`marketplace owner:     ${owner}`);
  console.log(`paused:                ${paused}`);
  console.log(`NFT owner:             ${await nft.owner()}`);
  console.log(`NFT1155 owner:         ${await nft1155.owner()}`);
  console.log(`NFT.marketplace:       ${await nft.marketplace()}`);
  console.log(`NFT1155.marketplace:   ${await nft1155.marketplace()}`);
  console.log(`NFT MAX_ROYALTY_BPS:   ${await nft.MAX_ROYALTY_BPS()}`);

  if (
    (await nft.marketplace()) !== marketplaceAddress ||
    (await nft1155.marketplace()) !== marketplaceAddress ||
    liveFeeRecipient !== feeRecipient
  ) {
    throw new Error("Post-deploy verification FAILED — wiring does not match intent");
  }
  console.log("Verification OK");

  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const existing = existsSync(deploymentsPath) ? JSON.parse(readFileSync(deploymentsPath, "utf-8")) : {};
  existing[network.name] = {
    ...(existing[network.name] ?? {}),
    chainId,
    DurchexNFT: nftAddress,
    DurchexNFT1155: nft1155Address,
    DurchexMarketplace: marketplaceAddress,
    feeRecipient,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`\nRecorded in ${deploymentsPath}`);

  if (network.name !== "hardhat" && network.name !== "localhost" && process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting for block confirmations before verifying…");
    await new Promise((r) => setTimeout(r, 30_000));
    for (const [name, address, args] of [
      ["DurchexNFT", nftAddress, []],
      ["DurchexNFT1155", nft1155Address, []],
      ["DurchexMarketplace", marketplaceAddress, [feeRecipient]],
    ] as const) {
      try {
        await run("verify:verify", { address, constructorArguments: args });
        console.log(`Verified ${name}`);
      } catch (err) {
        console.log(`Verify ${name} failed (can retry manually): ${(err as Error).message.split("\n")[0]}`);
      }
    }
  }

  console.log("\nEnv values to set:");
  console.log(`  NEXT_PUBLIC_MARKETPLACE_ADDRESS=${marketplaceAddress}`);
  console.log(`  DURCHEX_NFT_ADDRESS=${nftAddress}`);
  console.log(`  DURCHEX_NFT1155_ADDRESS=${nft1155Address}`);
  console.log(`  DURCHEX_NFT_CHAIN_ID=${chainId}`);
  console.log(`  DURCHEX_NFT1155_CHAIN_ID=${chainId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
