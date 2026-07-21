import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GeneratedArt } from "@/components/nft/GeneratedArt";

export function Hero({
  stats,
}: {
  stats: { totalVolumeEth: number; totalItems: number; collections: number; totalOwners: number };
}) {
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

        <div className="relative h-[420px] hidden lg:block" style={{ perspective: "1400px" }}>
          <FloatingCard
            seedKey="hero-a"
            className="absolute top-4 left-10 w-56 h-72 rotate-[-8deg]"
            delay="0s"
          />
          <FloatingCard
            seedKey="hero-b"
            className="absolute top-24 right-4 w-64 h-80 rotate-[6deg] z-10"
            delay="1.4s"
          />
          <FloatingCard
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
  seedKey,
  className,
  delay,
}: {
  seedKey: string;
  className?: string;
  delay: string;
}) {
  return (
    <div
      className={`animate-float surface-card overflow-hidden ${className}`}
      style={{ animationDelay: delay, transformStyle: "preserve-3d" }}
    >
      <GeneratedArt seedKey={seedKey} className="w-full h-full" />
    </div>
  );
}
