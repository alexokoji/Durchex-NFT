import type { Wallet } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  okxWallet,
  phantomWallet,
  trustWallet,
  bitgetWallet,
  rabbyWallet,
  zerionWallet,
  rainbowWallet,
  braveWallet,
  ledgerWallet,
  safeWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";

/**
 * How a wallet is reached from a mobile browser.
 *
 * `deeplink` wallets publish a documented universal link that opens an
 * arbitrary URL inside their own in-app dapp browser — tapping them carries
 * the visitor straight into the wallet with this site loaded, where the
 * wallet injects a provider and connects natively.
 *
 * `browse` wallets have an in-app browser but publish no such link (their
 * only documented deep link is the WalletConnect handshake, which is a
 * different flow). Rather than guess at an undocumented URL scheme that
 * would silently dead-end, we hand the visitor the site URL to paste into
 * that wallet's browser.
 */
type MobileEntry =
  | { kind: "deeplink"; build: (siteUrl: string) => string; note?: string }
  | { kind: "browse"; note?: string };

export type WalletEntry = {
  id: string;
  name: string;
  /** RainbowKit's own definition — used for its modal and for the icon. */
  create: (options: { projectId: string }) => Wallet;
  mobile: MobileEntry;
};

/**
 * Every wallet offered on Durchex, in display order. WalletConnect itself is
 * deliberately absent: it's a transport, not a wallet, and listing it as a
 * peer of MetaMask/OKX/etc. just adds a QR-code detour in front of wallets
 * that are already listed here by name. The named wallets below still use
 * the WalletConnect relay under the hood on desktop where they need it.
 */
export const WALLETS: WalletEntry[] = [
  {
    id: "metaMask",
    name: "MetaMask",
    create: metaMaskWallet,
    // https://docs.metamask.io/sdk/guides/use-deeplinks/ — the path is the
    // bare host + path, with no scheme.
    mobile: { kind: "deeplink", build: (url) => `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}` },
  },
  {
    id: "okx",
    name: "OKX Wallet",
    create: okxWallet,
    // https://web3.okx.com/build/docs/waas/app-universal-link — the okx://
    // scheme is wrapped in the download universal link so it still resolves
    // when the app isn't installed.
    mobile: {
      kind: "deeplink",
      build: (url) => `https://web3.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
    },
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    // coinbaseWallet is the one factory that needs an appName of its own.
    create: () => coinbaseWallet({ appName: "Durchex" }),
    // https://docs.cdp.coinbase.com/coinbase-wallet/developer-guidance/mobile-dapp-integration
    mobile: { kind: "deeplink", build: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  },
  {
    id: "phantom",
    name: "Phantom",
    create: phantomWallet,
    // https://docs.phantom.com/phantom-deeplinks/other-methods/browse
    mobile: {
      kind: "deeplink",
      build: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
    },
  },
  {
    id: "trust",
    name: "Trust Wallet",
    create: trustWallet,
    // https://developer.trustwallet.com/developer/develop-for-trust/deeplinking
    // coin_id 60 is Ethereum's SLIP-44 index. Trust removed its iOS dapp
    // browser to satisfy App Store rules, so this is Android-only in practice.
    mobile: {
      kind: "deeplink",
      build: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
      note: "Android only — Trust removed its iOS in-app browser.",
    },
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    create: bitgetWallet,
    mobile: { kind: "browse" },
  },
  { id: "rabby", name: "Rabby", create: rabbyWallet, mobile: { kind: "browse" } },
  { id: "zerion", name: "Zerion", create: zerionWallet, mobile: { kind: "browse" } },
  { id: "rainbow", name: "Rainbow", create: rainbowWallet, mobile: { kind: "browse" } },
  { id: "ledger", name: "Ledger Live", create: ledgerWallet, mobile: { kind: "browse" } },
];

/** Extra options that only make sense on a desktop browser. */
const DESKTOP_ONLY = [braveWallet, safeWallet, injectedWallet];

export function walletGroups(projectId: string) {
  return [
    {
      groupName: "Popular",
      wallets: WALLETS.slice(0, 5).map((entry) => () => entry.create({ projectId })),
    },
    {
      groupName: "More wallets",
      wallets: [...WALLETS.slice(5).map((entry) => () => entry.create({ projectId })), ...DESKTOP_ONLY],
    },
  ];
}

/** Wallets that can pull this site into their own in-app browser. */
export const DEEPLINK_WALLETS = WALLETS.filter((entry) => entry.mobile.kind === "deeplink");
/** Wallets with an in-app browser the visitor has to navigate themselves. */
export const BROWSE_WALLETS = WALLETS.filter((entry) => entry.mobile.kind === "browse");
