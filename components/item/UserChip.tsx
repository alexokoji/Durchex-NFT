import Link from "next/link";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { UserRef } from "@/lib/types";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function UserChip({ label, user }: { label: string; user: UserRef | null }) {
  if (!user) return null;
  return (
    <Link href={`/profile/${user.address}`} className="flex items-center gap-2.5 group">
      <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-white/10">
        <GeneratedArt seedKey={user.address} className="w-full h-full" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-white/40">{label}</div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-white truncate group-hover:text-purple-300 transition">
            {user.username ?? truncateAddress(user.address)}
          </span>
          <VerifiedBadge tier={user.verificationTier} className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}
