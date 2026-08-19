import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CollectionView } from "@/lib/types";

export function Hero({
  stats,
  collections,
}: {
  stats: { totalVolumeEth: number; totalItems: number; collections: number; totalOwners: number };
  /** Most popular collections, in order — the cards show these. */
  collections: CollectionView[];
}) {
  // Three cards, filled from the top collections and topped up with
  // generated art when the marketplace doesn't have three yet. Decorative
  // only: no links, no alt text worth reading, aria-hidden.
  const cards = [0, 1, 2].map((i) => collections[i] ?? null);
  return (
    <section className="relative overflow-hidden bg-mesh border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-purple-500/30 text-xs font-medium text-purple-200 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Real lazy minting — zero gas to list
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight text-gradient-purple mb-6">
            Discover, collect
            <br />
            &amp; sell extraordinary NFTs
          </h1>
          <p className="text-white/55 text-base sm:text-lg max-w-md mb-8 leading-relaxed">
            Durchex is the purple x black marketplace for digital collectibles. List an
            item instantly for free — it only mints on-chain the moment someone buys it.
          </p>
          <div className="flex flex-wrap gap-3 mb-12">
            <Button href="/explore" size="lg" icon={<ArrowRight className="w-4 h-4" />}>
              Explore Now
            </Button>
            <Button href="/create" variant="secondary" size="lg">
              Start Creating
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-lg">
            <StatMini label="Total Volume" value={`${stats.totalVolumeEth.toFixed(0)}`} suffix="ETH" />
            <StatMini label="Items" value={stats.totalItems.toLocaleString()} />
            <StatMini label="Collections" value={stats.collections.toString()} />
            <StatMini label="Owners" value={stats.totalOwners.toLocaleString()} />
          </div>
        </div>

        <div className="relative h-[420px] hidden lg:block" style={{ perspective: "1400px" }} aria-hidden="true">
          <FloatingCard
            collection={cards[0]}
            seedKey="hero-a"
            className="absolute top-4 left-10 w-56 h-72 rotate-[-8deg]"
            delay="0s"
          />
          <FloatingCard
            collection={cards[1]}
            seedKey="hero-b"
            className="absolute top-24 right-4 w-64 h-80 rotate-[6deg] z-10"
            delay="1.4s"
          />
          <FloatingCard
            collection={cards[2]}
            seedKey="hero-c"
            className="absolute bottom-0 left-24 w-52 h-64 rotate-[3deg]"
            delay="2.6s"
          />
        </div>
      </div>
    </section>
  );
}

function StatMini({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <div className="font-display text-xl sm:text-2xl font-semibold text-white tabular-nums">
        {value}
        {suffix && <span className="text-purple-300 text-sm ml-1">{suffix}</span>}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-white/40 mt-0.5">{label}</div>
    </div>
  );
}

function FloatingCard({
  collection,
  seedKey,
  className,
  delay,
}: {
  collection: CollectionView | null;
  seedKey: string;
  className?: string;
  delay: string;
}) {
  const image = collection?.logoUrl || collection?.bannerUrl || "";
  return (
    <div
      className={`animate-float surface-card overflow-hidden ${className}`}
      style={{ animationDelay: delay, transformStyle: "preserve-3d" }}
    >
      {image ? (
        <div className="relative w-full h-full">
          <img src={image} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pt-8 pb-2.5">
            <div className="text-xs font-medium text-white truncate">{collection!.name}</div>
            <div className="text-[10px] text-white/50 tabular-nums">
              {collection!.floorEth > 0 ? `${collection!.floorEth} ETH floor` : "No floor yet"}
            </div>
          </div>
        </div>
      ) : (
        <GeneratedArt seedKey={seedKey} className="w-full h-full" />
      )}
    </div>
  );
}
