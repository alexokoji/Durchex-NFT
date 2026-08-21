import { GeneratedArt } from "@/components/nft/GeneratedArt";

export function MediaPanel({ seedKey, url, type, alt }: { seedKey: string; url?: string; type?: string; alt?: string }) {
  // A square that fills a phone's width is nearly the whole screen, which
  // pushes the price and every action below the fold. Capping the width
  // keeps it square — capping height would letterbox it into a short wide
  // box — and 68% is small enough to actually change what you see first,
  // where an earlier 45vh cap resolved to roughly the full width anyway
  // and did nothing. The column governs the width from lg upward.
  return (
    <div className="surface-card glow-ring overflow-hidden aspect-square w-full max-w-[68%] sm:max-w-[380px] lg:max-w-none mx-auto">
      {url && type?.startsWith("video/") ? <video src={url} controls preload="metadata" className="w-full h-full object-contain bg-black" /> : url && type?.startsWith("audio/") ? <div className="w-full h-full grid place-items-center p-8 bg-black"><audio src={url} controls className="w-full" /></div> : url ? <img src={url} alt={alt ?? "NFT media"} className="w-full h-full object-contain bg-black" /> : <GeneratedArt seedKey={seedKey} className="w-full h-full" />}
    </div>
  );
}
