import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import fs from "node:fs";
import path from "node:path";

// No dotenv dependency — just load contracts/.env by hand so RPC URLs and
// the deployer key are available without a new package.
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const AMOY_RPC_URL = process.env.AMOY_RPC_URL ?? "";
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "";
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL ?? "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OpenZeppelin v5's utils/Bytes.sol uses MCOPY (EIP-5656), only
      // available from the Cancun hardfork onward.
      evmVersion: "cancun",
    },
  },
  networks: {
    // FORK=1 points the in-process chain at a copy of mainnet, so a change
    // can be rehearsed against the real deployed contracts and real token
    // state before any of it is signed for real. Off by default — the unit
    // suite must not depend on an RPC being reachable.
    hardhat:
      process.env.FORK === "1" && MAINNET_RPC_URL
        ? { forking: { url: MAINNET_RPC_URL }, chainId: 1 }
        : {},
    // Polygon Amoy testnet — see docs/Durchex-NFT-Marketplace-Full-Specification.pdf
    // section 18 (Deployment & Infrastructure).
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 80002,
    },
    polygon: {
      url: POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 137,
    },
    // Ethereum Sepolia testnet — deploy and verify here first, no real funds at risk.
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    // Ethereum mainnet — real ETH, real gas. Only run `npm run deploy:mainnet`
    // after a full Sepolia dry run.
    mainnet: {
      url: MAINNET_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 1,
      // A contract deploy takes long enough that the default timeout can
      // fire while the transaction is already mining. That is the worst
      // possible failure — the script aborts believing nothing happened,
      // while the deploy in fact succeeded and the gas is spent.
      timeout: 180_000,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
