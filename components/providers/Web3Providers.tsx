"use client";

import { ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/web3/config";

const baseRainbowKitTheme = darkTheme({
  accentColor: "#7C3AED",
  accentColorForeground: "#ffffff",
  borderRadius: "medium",
  overlayBlur: "small",
});

// darkTheme()'s `fontStack` option only picks between two built-in presets
// (no way to pass an arbitrary font through it), and overriding the
// `--rk-fonts-body` CSS variable from our own stylesheet doesn't reliably
// win against RainbowKit's inline style. Overriding `fonts.body` on the
// theme object itself is the value RainbowKit actually applies inline, so
// it always matches the rest of the site's font.
const rainbowKitTheme = {
  ...baseRainbowKitTheme,
  fonts: {
    ...baseRainbowKitTheme.fonts,
    body: "var(--font-inter), Inter, sans-serif",
  },
};

export function Web3Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowKitTheme}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
