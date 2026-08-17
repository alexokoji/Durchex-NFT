import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  mainnet,
  base,
  polygon,
  polygonAmoy,
  sepolia,
  avalanche,
  optimism,
  arbitrum,
  bsc,
  hyperliquid,
  hardhat,
} from "wagmi/chains";
import { SUPPORTED_EVM_CHAIN_IDS } from "@/lib/web3/supportedChains";

// A public placeholder so wallet connect doesn't hard-crash without a real
// WalletConnect Cloud project id in dev. Injected wallets (MetaMask, etc.)
// still work fine without one — only the WalletConnect QR/relay path needs it.
// Get a real one at https://cloud.walletconnect.com for production.
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "caa9727fd26fe72353d75ddc7fcde24c";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://durchex-two.vercel.app";

// Every EVM network from the deployment-cost estimate. `DurchexNFT` +
// `DurchexMarketplace` are plain Solidity, so the same contracts deploy
// unmodified to all of these (see contracts/README.md) — Solana and Tezos
// are NOT here because they aren't EVM-compatible at all; lazy minting there
// would be a separate, non-Solidity implementation, not a redeploy.
//
// `hardhat` (chainId 31337) is only useful with a local `npx hardhat node`
// running — it's how the one "live" seeded collection's real Buy Now flow
// gets tested end-to-end without needing a funded testnet account. Harmless
// to list even when nothing's running on it; a wallet just won't be able to
// switch to it.
export const wagmiConfig = getDefaultConfig({
  appName: "Durchex",
  appDescription: "Durchex is a multi-chain NFT marketplace for creators and collectors.",
  appUrl: APP_URL,
  appIcon: `${APP_URL}/icon.svg`,
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [mainnet, base, polygon, arbitrum, optimism, avalanche, bsc, hyperliquid, polygonAmoy, sepolia, hardhat],
  ssr: true,
});

export const CHAIN_META: Record<number, { label: string; symbol: string; accent: string }> = {
  [mainnet.id]: { label: "Ethereum", symbol: "ETH", accent: "#627EEA" },
  [base.id]: { label: "Base", symbol: "ETH", accent: "#0052FF" },
  [polygon.id]: { label: "Polygon", symbol: "POL", accent: "#8247E5" },
  [arbitrum.id]: { label: "Arbitrum", symbol: "ETH", accent: "#28A0F0" },
  [optimism.id]: { label: "Optimism", symbol: "ETH", accent: "#FF0420" },
  [avalanche.id]: { label: "Avalanche", symbol: "AVAX", accent: "#E84142" },
  [bsc.id]: { label: "BNB Chain", symbol: "BNB", accent: "#F0B90B" },
  [hyperliquid.id]: { label: "Hyperliquid", symbol: "HYPE", accent: "#97FCE4" },
  [polygonAmoy.id]: { label: "Polygon Amoy", symbol: "POL", accent: "#8247E5" },
  [sepolia.id]: { label: "Ethereum Sepolia", symbol: "ETH", accent: "#627EEA" },
  [hardhat.id]: { label: "Localhost", symbol: "ETH", accent: "#6B6478" },
};

// The subset shown as first-class options in the network switcher — testnets
// and the local dev chain are supported (a connected wallet can still switch
// to them) but stay out of the main list to keep it focused on the real
// deployment targets.
export const PRIMARY_CHAIN_IDS = SUPPORTED_EVM_CHAIN_IDS;
