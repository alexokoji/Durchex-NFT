import { GeneratedArt } from "@/components/nft/GeneratedArt";

export function MediaPanel({ seedKey, url, type, alt }: { seedKey: string; url?: string; type?: string; alt?: string }) {
  return (
    <div className="surface-card glow-ring overflow-hidden aspect-square">
      {url && type?.startsWith("video/") ? <video src={url} controls preload="metadata" className="w-full h-full object-contain bg-black" /> : url && type?.startsWith("audio/") ? <div className="w-full h-full grid place-items-center p-8 bg-black"><audio src={url} controls className="w-full" /></div> : url ? <img src={url} alt={alt ?? "NFT media"} className="w-full h-full object-contain bg-black" /> : <GeneratedArt seedKey={seedKey} className="w-full h-full" />}
    </div>
  );
}
