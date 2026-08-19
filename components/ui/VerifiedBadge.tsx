import { TIER_LABELS, VerificationTier } from "@/lib/verification";

// The two tiers invert each other: white badge with a purple tick, purple
// badge with a white tick. Drawn as a solid shape rather than lucide's
// outlined BadgeCheck because a filled badge reads at 12px, where an
// outline collapses into a smudge — and because the tick has to be a
// second colour, which a single-currentColor icon can't do.
// Literal hex rather than the CSS custom properties these mirror
// (--color-purple-700): var() inside an SVG presentation attribute is not
// honoured everywhere, and a badge that silently renders black is worse
// than one that can't follow a theme change.
const PURPLE = "#7c3aed";
const TIER_COLORS: Record<Exclude<VerificationTier, "none">, { badge: string; tick: string }> = {
  white: { badge: "#ffffff", tick: PURPLE },
  purple: { badge: PURPLE, tick: "#ffffff" },
};

/**
 * The verification badge shown next to a username everywhere one appears.
 *
 * Renders nothing for unverified users, so call sites don't each need
 * their own conditional.
 */
export function VerifiedBadge({
  tier,
  className = "w-4 h-4",
}: {
  tier: VerificationTier | undefined;
  className?: string;
}) {
  if (!tier || tier === "none") return null;
  const { badge, tick } = TIER_COLORS[tier];

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      role="img"
      aria-label={TIER_LABELS[tier]}
    >
      <path
        fill={badge}
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      />
      <path
        d="m9 12 2 2 4-4"
        fill="none"
        stroke={tick}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
