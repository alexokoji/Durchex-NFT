import { BadgeCheck } from "lucide-react";
import { TIER_LABELS, VerificationTier } from "@/lib/verification";

/**
 * The badge shown next to a username everywhere one appears.
 *
 * White reads as "verified creator", purple as "identity verified" — the
 * purple one is deliberately the brand colour, so the higher tier is the
 * one that stands out against the dark UI rather than the one that
 * blends in.
 */
export function VerifiedBadge({
  tier,
  className = "w-4 h-4",
}: {
  tier: VerificationTier | undefined;
  className?: string;
}) {
  if (!tier || tier === "none") return null;
  return (
    <BadgeCheck
      className={`${className} shrink-0 ${tier === "purple" ? "text-purple-400" : "text-white"}`}
      aria-label={TIER_LABELS[tier]}
    />
  );
}
