import { ethers, network, run } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Deploys DurchexCollection1155Factory (which deploys its own
// implementation in its constructor) against the marketplace already live
// on this network. Additive — nothing existing is touched.
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

  const Factory = await ethers.getContractFactory("DurchexCollection1155Factory");
  const factory = await Factory.deploy(marketplace);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const implementation = await factory.implementation();

  console.log(`DurchexCollection1155Factory -> ${factoryAddress}`);
  console.log(`  implementation             -> ${implementation}`);

  const probe = ethers.id("probe");
  console.log(`  predictCollection(probe)    = ${await factory.predictCollection(probe)}`);
  console.log(`  isDeployed(probe)           = ${await factory.isDeployed(probe)}`);

  if ((await factory.marketplace()) !== marketplace) {
    throw new Error("Post-deploy check FAILED — factory marketplace mismatch");
  }
  console.log("Verification OK");

  existing[network.name] = {
    ...current,
    DurchexCollection1155Factory: factoryAddress,
    DurchexCollection1155Implementation: implementation,
  };
  writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`\nRecorded in ${deploymentsPath}`);

  if (network.name !== "hardhat" && process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting before verification…");
    await new Promise((r) => setTimeout(r, 30_000));
    for (const [name, address, args] of [
      ["DurchexCollection1155Factory", factoryAddress, [marketplace]],
      ["DurchexCollection1155 (impl)", implementation, []],
    ] as const) {
      try {
        await run("verify:verify", { address, constructorArguments: args });
        console.log(`Verified ${name}`);
      } catch (err) {
        console.log(`Verify ${name}: ${(err as Error).message.split("\n")[0]}`);
      }
    }
  }

  console.log(`\n  COLLECTION_1155_FACTORY_${chainId}=${factoryAddress}`);
  console.log(`  COLLECTION_1155_IMPLEMENTATION_${chainId}=${implementation}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
