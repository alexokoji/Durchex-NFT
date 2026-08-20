import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Web3Providers } from "@/components/providers/Web3Providers";
import { CurrencyProvider } from "@/components/providers/CurrencyProvider";
import { AutoAuthGate } from "@/components/wallet/AutoAuthGate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Durchex — Discover, Collect & Sell NFTs",
  description:
    "Durchex is an NFT marketplace with real lazy minting, live auctions and a stylized Explore page. Purple x Black. Built on Next.js and MongoDB.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-void text-white">
        <Web3Providers>
          <CurrencyProvider>
          <AutoAuthGate />
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          </CurrencyProvider>
        </Web3Providers>
      </body>
    </html>
  );
}
