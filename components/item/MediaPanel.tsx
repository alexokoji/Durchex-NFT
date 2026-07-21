import { GeneratedArt } from "@/components/nft/GeneratedArt";

export function MediaPanel({ seedKey }: { seedKey: string }) {
  return (
    <div className="surface-card glow-ring overflow-hidden aspect-square">
      <GeneratedArt seedKey={seedKey} className="w-full h-full" />
    </div>
  );
}
