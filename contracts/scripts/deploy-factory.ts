import { ethers, network, run } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Deploys DurchexCollectionFactory (which deploys its own implementation in
// its constructor) and points it at the marketplace already live on this
// network. Additive — nothing existing is touched.
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const existing = existsSync(deploymentsPath) ? JSON.parse(readFileSync(deploymentsPath, "utf-8")) : {};
  const current = existing[network.name] ?? {};

  const marketplace = current.DurchexMarketplace;
  if (!marketplace) throw new Error(`No DurchexMarketplace recorded for "${network.name}"`);

  console.log(`Network:     ${network.name} (${chainId})`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`Balance:     ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Marketplace: ${marketplace}\n`);

  const Factory = await ethers.getContractFactory("DurchexCollectionFactory");
  const factory = await Factory.deploy(marketplace);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const implementation = await factory.implementation();

  console.log(`DurchexCollectionFactory -> ${factoryAddress}`);
  console.log(`  implementation         -> ${implementation}`);

  // Prove the address prediction works on this network before anything
  // relies on it for signing.
  const probe = ethers.id("probe");
  console.log(`  predictCollection(probe) = ${await factory.predictCollection(probe)}`);
  console.log(`  isDeployed(probe)        = ${await factory.isDeployed(probe)}`);

  if ((await factory.marketplace()) !== marketplace) {
    throw new Error("Post-deploy check FAILED — factory marketplace mismatch");
  }
  console.log("Verification OK");

  existing[network.name] = {
    ...current,
    DurchexCollectionFactory: factoryAddress,
    DurchexCollectionImplementation: implementation,
  };
  writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`\nRecorded in ${deploymentsPath}`);

  if (network.name !== "hardhat" && process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting before verification…");
    await new Promise((r) => setTimeout(r, 30_000));
    for (const [name, address, args] of [
      ["DurchexCollectionFactory", factoryAddress, [marketplace]],
      ["DurchexCollection (impl)", implementation, []],
    ] as const) {
      try {
        await run("verify:verify", { address, constructorArguments: args });
        console.log(`Verified ${name}`);
      } catch (err) {
        console.log(`Verify ${name}: ${(err as Error).message.split("\n")[0]}`);
      }
    }
  }

  console.log(`\n  NEXT_PUBLIC_COLLECTION_FACTORY_${chainId}=${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
