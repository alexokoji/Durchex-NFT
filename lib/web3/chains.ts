import { defineChain, type Chain } from "viem";
import {
  ink,
  mainnet,
  sepolia,
  polygon,
  polygonAmoy,
  base,
  arbitrum,
  optimism,
  hardhat,
} from "viem/chains";

/**
 * Chains Durchex knows about that viem does not ship a definition for.
 *
 * Kept separate from config.ts because that file pulls in wagmi and
 * RainbowKit, which cannot be imported from an API route — the chain facts
 * themselves are needed on both sides.
 */

/**
 * Robinhood Chain — an Arbitrum Orbit (Nitro) L2 settling to Ethereum with
 * blob data availability, ETH for gas. Mainnet went live 2026-07-01.
 *
 * Parameters taken from docs.robinhood.com/chain/connecting and verified
 * against the node: eth_chainId returns 0x1237 and block headers carry
 * l1BlockNumber, which is the Orbit tell.
 *
 * The public RPC is documented as rate-limited and explicitly "not for
 * production", so a real deployment should set NEXT_PUBLIC_RPC_URL_4663 to
 * an Alchemy endpoint (robinhood-mainnet.g.alchemy.com). This default only
 * keeps the app working without one.
 */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } },
  testnet: true,
});

/** Ink — Kraken's OP Stack L2, ETH for gas. viem already defines it. */
export { ink };

/**
 * Every chain the server may need a viem client for, by id.
 *
 * There were three copies of this list — the wagmi config, the reconciler,
 * and the voucher-nonce reader — and adding Robinhood Chain to two of them
 * left the third silently wrong: an unrecognised chain there falls back to
 * counting local pending vouchers instead of asking the contract, which
 * agrees with the chain only until the first redemption and then hands out
 * a nonce that is already spent. Every voucher signed afterwards reverts.
 *
 * A missing entry causes no error, which is exactly why the list belongs
 * in one place.
 */
export const EVM_CHAINS: Record<number, Chain> = Object.fromEntries(
  [mainnet, sepolia, polygon, polygonAmoy, base, arbitrum, optimism, hardhat, robinhood, ink].map((c) => [c.id, c])
);
