import Link from "next/link";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { UserRef } from "@/lib/types";
import { UserAvatar } from "@/components/ui/UserAvatar";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function UserChip({ label, user }: { label: string; user: UserRef | null }) {
  if (!user) return null;
  return (
    <Link href={`/profile/${user.address}`} className="flex items-center gap-2.5 group">
      <UserAvatar address={user.address} avatarUrl={user.avatarUrl} className="w-9 h-9 border border-white/10" />
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
