import { BadgeCheck, Crown } from "lucide-react";
import { SectionHeading } from "@/components/home/SectionHeading";
import { GeneratedArt } from "@/components/nft/GeneratedArt";

interface Creator {
  id: string;
  username: string;
  isVerified: boolean;
  followerCount: number;
  itemCount: number;
}

export function TopCreators({ creators }: { creators: Creator[] }) {
  // Nobody has minted yet — an empty leaderboard says less than no
  // leaderboard at all.
  if (creators.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <SectionHeading eyebrow="Leaderboard" title="Top Creators" />
      <div className="surface-card p-2 sm:p-3">
        {creators.map((creator, i) => (
          <div
            key={creator.id}
            className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-white/5 transition"
          >
            <div className="w-6 text-center font-display font-semibold text-white/40">
              {i === 0 ? <Crown className="w-4 h-4 text-purple-400 mx-auto" /> : i + 1}
            </div>
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/10">
              <GeneratedArt seedKey={`creator-${creator.id}`} className="w-full h-full" />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <span className="font-medium text-white truncate">@{creator.username}</span>
              {creator.isVerified && <BadgeCheck className="w-4 h-4 text-purple-400 shrink-0" />}
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm text-white tabular-nums">
                {creator.itemCount.toLocaleString()} {creator.itemCount === 1 ? "NFT" : "NFTs"}
              </div>
              <div className="text-[11px] text-white/40 tabular-nums">
                {creator.followerCount.toLocaleString()} followers
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
