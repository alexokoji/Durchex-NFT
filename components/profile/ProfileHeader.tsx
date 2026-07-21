"use client";

import { BadgeCheck, CalendarDays, Pencil, UserPlus, UserCheck } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/hooks/useSession";
import { useFollow } from "@/hooks/useFollow";
import { ProfileView } from "@/lib/types";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ProfileHeader({ profile }: { profile: ProfileView }) {
  const { user } = useSession();
  const isOwnProfile = user?.address === profile.address;
  const { following, followerCount, toggle, pending } = useFollow(
    profile.address,
    profile.followerCount
  );

  return (
    <div className="relative">
      <div className="h-40 sm:h-56 rounded-2xl overflow-hidden">
        <GeneratedArt seedKey={`banner-${profile.address}`} className="w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
      </div>

      <div className="px-4 sm:px-8 -mt-14 relative flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between">
        <div className="flex items-end gap-4">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-void shadow-xl shrink-0">
            <GeneratedArt seedKey={profile.address} className="w-full h-full" />
          </div>
          <div className="pb-1">
            <div className="flex items-center gap-1.5">
              <h1 className="font-display text-2xl font-semibold text-white">
                {profile.username}
              </h1>
              {profile.isVerified && <BadgeCheck className="w-5 h-5 text-purple-400" />}
            </div>
            <div className="text-sm text-white/40 font-mono">{truncateAddress(profile.address)}</div>
          </div>
        </div>

        {isOwnProfile ? (
          <Button
            href="/settings"
            variant="secondary"
            size="sm"
            icon={<Pencil className="w-3.5 h-3.5" />}
          >
            Edit Profile
          </Button>
        ) : (
          <Button
            variant={following ? "secondary" : "primary"}
            size="sm"
            onClick={toggle}
            disabled={pending}
            icon={following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
          >
            {following ? "Following" : "Follow"}
          </Button>
        )}
      </div>

      <div className="px-4 sm:px-8 mt-5">
        {profile.bio && <p className="text-sm text-white/55 max-w-xl leading-relaxed mb-3">{profile.bio}</p>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/50">
          <span>
            <b className="text-white">{followerCount.toLocaleString()}</b> followers
          </span>
          <span>
            <b className="text-white">{profile.followingCount.toLocaleString()}</b> following
          </span>
          <span className="flex items-center gap-1.5 text-white/40">
            <CalendarDays className="w-3.5 h-3.5" />
            Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
        </div>
      </div>
    </div>
  );
}
