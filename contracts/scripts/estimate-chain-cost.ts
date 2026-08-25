import { artifacts } from "hardhat";
import { createPublicClient, defineChain, encodeDeployData, encodeFunctionData, formatEther, formatGwei, http, type Address } from "viem";
import { ink } from "viem/chains";

/**
 * What it costs to put the whole Durchex contract set on a new chain.
 *
 * Estimated against each chain's own node rather than extrapolated from
 * Ethereum gas, because the two rollup stacks price the same bytes very
 * differently and neither resembles L1:
 *
 *   - Arbitrum Orbit (Robinhood Chain) folds the L1 data cost into the gas
 *     units eth_estimateGas returns, so the estimate is already complete.
 *   - OP Stack (Ink) does not. Its L2 gas covers execution only, and the
 *     L1 data fee is charged separately by the GasPriceOracle predeploy.
 *     For contract deploys, which are almost entirely calldata, that fee
 *     is usually the larger half — ignoring it would understate the bill.
 */
const ROBINHOOD = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

const OP_GAS_ORACLE = "0x420000000000000000000000000000000000000F" as Address;
const L1_FEE_ABI = [
  { type: "function", name: "getL1Fee", stateMutability: "view", inputs: [{ type: "bytes" }], outputs: [{ type: "uint256" }] },
] as const;

// A funded mainnet address. Only used as the `from` for estimation — some
// nodes reject an estimate from an account with no history.
const FROM = "0xf1b1f1410D82Bb5e4bc775a6DdFba895E396314d" as Address;
const FEE_RECIPIENT = FROM;
// Estimating a factory needs a marketplace address that already has code,
// or its zero-address guard reverts. Any live contract satisfies that.
const PLACEHOLDER_MARKETPLACE = "0x2Cd081112d1e2f5eE033D7D3Ee313D9Ff5ADdF56" as Address;

async function deployData(name: string, args: unknown[]) {
  const artifact = await artifacts.readArtifact(name);
  return {
    name,
    bytecodeBytes: (artifact.bytecode.length - 2) / 2,
    data: encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode as `0x${string}`, args }),
  };
}

async function main() {
  const set = [
    await deployData("DurchexNFT", []),
    await deployData("DurchexNFT1155", []),
    await deployData("DurchexMarketplace", [FEE_RECIPIENT]),
    await deployData("DurchexOffersEscrow", [FEE_RECIPIENT]),
    await deployData("DurchexCollectionFactory", [PLACEHOLDER_MARKETPLACE]),
    await deployData("DurchexCollection1155Factory", [PLACEHOLDER_MARKETPLACE]),
  ];

  // Wiring the two shared lazy-mint contracts to the marketplace.
  const setMarketplace = encodeFunctionData({
    abi: [{ type: "function", name: "setMarketplace", inputs: [{ type: "address" }], outputs: [] }],
    functionName: "setMarketplace",
    args: [PLACEHOLDER_MARKETPLACE],
  });

  const ethUsd = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot")
    .then((r) => r.json())
    .then((j) => Number(j.data.amount))
    .catch(() => 0);
  console.log(`ETH/USD: $${ethUsd.toLocaleString()}\n`);

  for (const { chain, opStack } of [
    { chain: ROBINHOOD, opStack: false },
    { chain: ink, opStack: true },
  ]) {
    const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 60_000 }) });
    const gasPrice = await client.getGasPrice();

    console.log(`══ ${chain.name} (chain ${chain.id}) ══`);
    console.log(`   gas price ${formatGwei(gasPrice)} gwei | L1 data fee ${opStack ? "charged separately (OP Stack)" : "included in gas (Orbit)"}`);

    let totalWei = BigInt(0);
    for (const item of set) {
      const gas = await client.estimateGas({ account: FROM, data: item.data });
      let wei = gas * gasPrice;
      let l1 = BigInt(0);
      if (opStack) {
        l1 = await client.readContract({ address: OP_GAS_ORACLE, abi: L1_FEE_ABI, functionName: "getL1Fee", args: [item.data] });
        wei += l1;
      }
      totalWei += wei;
      console.log(
        `   ${item.name.padEnd(30)} ${String(item.bytecodeBytes).padStart(6)}B  gas ${String(gas).padStart(9)}` +
          (opStack ? `  +L1 ${formatEther(l1).slice(0, 10)}` : "") +
          `  = ${formatEther(wei).slice(0, 10)} ETH`
      );
    }

    // Two setMarketplace calls, estimated against the live mainnet contract
    // since an identical one does not exist on the target chain yet.
    const wiringGas = BigInt(50_000);
    const wiringWei = wiringGas * BigInt(2) * gasPrice;
    totalWei += wiringWei;
    console.log(`   ${"2x setMarketplace (est.)".padEnd(30)}         gas ${String(wiringGas * BigInt(2)).padStart(9)}  = ${formatEther(wiringWei).slice(0, 10)} ETH`);
    void setMarketplace;

    console.log(`   ${"─".repeat(66)}`);
    console.log(`   TOTAL ${formatEther(totalWei)} ETH${ethUsd ? `  ≈ $${(Number(formatEther(totalWei)) * ethUsd).toFixed(2)}` : ""}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
