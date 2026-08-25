import { defineChain } from "viem";
import { ink } from "viem/chains";

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
