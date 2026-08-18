import { ethers, network, run } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Deploys DurchexOffers, the settlement contract for buyer-initiated
// collection offers. Additive — the live DurchexMarketplace is untouched
// and needs no changes.
const WETH: Record<string, string> = {
  mainnet: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  sepolia: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const weth = process.env.WETH_ADDRESS || WETH[network.name];
  if (!weth) throw new Error(`No WETH address known for network "${network.name}" — set WETH_ADDRESS`);

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || deployer.address;

  console.log(`Network:       ${network.name} (chainId ${chainId})`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Balance:       ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Payment token: ${weth}`);
  console.log(`Fee recipient: ${feeRecipient}\n`);

  const DurchexOffers = await ethers.getContractFactory("DurchexOffers");
  const offers = await DurchexOffers.deploy(weth, feeRecipient);
  await offers.waitForDeployment();
  const address = await offers.getAddress();
  console.log(`DurchexOffers -> ${address}`);

  const [fee, maxFee, token, owner, paused] = await Promise.all([
    offers.platformFeeBps(),
    offers.MAX_PLATFORM_FEE_BPS(),
    offers.paymentToken(),
    offers.owner(),
    offers.paused(),
  ]);
  console.log("\n--- Post-deploy verification ---");
  console.log(`platformFeeBps: ${fee} (${Number(fee) / 100}%)  ceiling ${Number(maxFee) / 100}%`);
  console.log(`paymentToken:   ${token}`);
  console.log(`owner:          ${owner}`);
  console.log(`paused:         ${paused}`);
  if (token.toLowerCase() !== weth.toLowerCase()) throw new Error("Payment token mismatch — aborting");
  console.log("Verification OK");

  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const existing = existsSync(deploymentsPath) ? JSON.parse(readFileSync(deploymentsPath, "utf-8")) : {};
  existing[network.name] = {
    ...(existing[network.name] ?? {}),
    DurchexOffers: address,
    paymentToken: weth,
  };
  writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`\nRecorded in ${deploymentsPath}`);

  if (network.name !== "hardhat" && process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting before verifying…");
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run("verify:verify", { address, constructorArguments: [weth, feeRecipient] });
      console.log("Verified DurchexOffers");
    } catch (err) {
      console.log(`Verify failed (retry manually): ${(err as Error).message.split("\n")[0]}`);
    }
  }

  console.log(`\n  NEXT_PUBLIC_OFFERS_ADDRESS_${chainId}=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
