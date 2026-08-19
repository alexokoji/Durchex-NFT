"use client";

import { CalendarDays, Pencil, UserPlus, UserCheck } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/hooks/useSession";
import { useFollow } from "@/hooks/useFollow";
import { ProfileView } from "@/lib/types";
import { TIER_LABELS } from "@/lib/verification";

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

  // Handles are stored bare, so they're turned into real URLs here rather
  // than trusting whatever the user typed to be a link.
  const socialLinks = [
    profile.socials.twitter && {
      key: "twitter",
      label: `@${profile.socials.twitter.replace(/^@/, "")}`,
      href: `https://x.com/${profile.socials.twitter.replace(/^@/, "")}`,
    },
    profile.socials.instagram && {
      key: "instagram",
      label: `Instagram`,
      href: `https://instagram.com/${profile.socials.instagram.replace(/^@/, "")}`,
    },
    profile.socials.discord && { key: "discord", label: profile.socials.discord, href: "" },
    profile.socials.website && {
      key: "website",
      label: "Website",
      href: /^https?:\/\//.test(profile.socials.website)
        ? profile.socials.website
        : `https://${profile.socials.website}`,
    },
  ].filter((l): l is { key: string; label: string; href: string } => !!l && !!l.href);

  return (
    <div className="relative">
      {/* `relative` matters: without it the gradient below anchors to the
          outer container instead of the banner and paints over the name,
          follower counts and joined date further down the page. */}
      <div className="relative h-40 sm:h-56 rounded-2xl overflow-hidden">
        {profile.bannerUrl ? (
          <img src={profile.bannerUrl} alt={`${profile.username} cover`} className="w-full h-full object-cover" />
        ) : (
          <GeneratedArt seedKey={`banner-${profile.address}`} className="w-full h-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
      </div>

      <div className="px-4 sm:px-8 -mt-14 relative flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between">
        <div className="flex items-end gap-4">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-void shadow-xl shrink-0">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={`${profile.username} avatar`} className="w-full h-full object-cover" />
            ) : (
              <GeneratedArt seedKey={profile.address} className="w-full h-full" />
            )}
          </div>
          <div className="pb-1">
            <div className="flex items-center gap-1.5">
              <h1 className="font-display text-2xl font-semibold text-white">
                {profile.username}
              </h1>
              <VerifiedBadge tier={profile.verificationTier} className="w-5 h-5" />
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

      <div className="relative z-10 px-4 sm:px-8 mt-5">
        {profile.verificationTier !== "none" && (
          <div className="inline-flex items-center gap-1.5 mb-3 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            <VerifiedBadge tier={profile.verificationTier} className="w-3.5 h-3.5" />
            <span className="text-[11px] text-white/60">{TIER_LABELS[profile.verificationTier]}</span>
          </div>
        )}
        {profile.bio && <p className="text-sm text-white/55 max-w-xl leading-relaxed mb-3">{profile.bio}</p>}
        {socialLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {socialLinks.map(({ key, href, label }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-white/45 hover:text-purple-300 transition"
              >
                {label}
              </a>
            ))}
          </div>
        )}
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
