import { GeneratedArt } from "@/components/nft/GeneratedArt";

export function MediaPanel({ seedKey, url, type, alt }: { seedKey: string; url?: string; type?: string; alt?: string }) {
  // A square that fills a phone's width is nearly the whole screen, which
  // pushes the price and every action below the fold. The *width* is
  // capped rather than the height, so it stays square instead of
  // letterboxing into a short wide box. On large screens the column sets
  // the width and the cap does nothing.
  return (
    <div className="surface-card glow-ring overflow-hidden aspect-square w-full max-w-[min(100%,45vh)] lg:max-w-none mx-auto">
      {url && type?.startsWith("video/") ? <video src={url} controls preload="metadata" className="w-full h-full object-contain bg-black" /> : url && type?.startsWith("audio/") ? <div className="w-full h-full grid place-items-center p-8 bg-black"><audio src={url} controls className="w-full" /></div> : url ? <img src={url} alt={alt ?? "NFT media"} className="w-full h-full object-contain bg-black" /> : <GeneratedArt seedKey={seedKey} className="w-full h-full" />}
    </div>
  );
}
