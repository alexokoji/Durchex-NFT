/**
 * Verification tiers and what it takes to earn one.
 *
 * Two levels, both earned rather than bought. White says "this person
 * really makes things here" — it needs a real body of work plus a complete,
 * public profile, because a badge on an empty profile tells a viewer
 * nothing. Purple says "and we know who they are" — same profile bar, a
 * much larger body of work, and an identity document a human reviews.
 *
 * The thresholds count NFTs the user created, not items they own: buying
 * a hundred NFTs makes you a collector, which isn't what the badge claims.
 */
export const VERIFICATION_TIERS = ["none", "white", "purple"] as const;
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

/** Tiers a user can actually apply for. */
export const APPLICABLE_TIERS = ["white", "purple"] as const;
export type ApplicableTier = (typeof APPLICABLE_TIERS)[number];

export const TIER_LABELS: Record<VerificationTier, string> = {
  none: "Not verified",
  white: "Verified creator",
  purple: "Identity verified",
};

export const TIER_MIN_NFTS: Record<ApplicableTier, number> = {
  white: 10,
  purple: 50,
};

export const TIER_RANK: Record<VerificationTier, number> = { none: 0, white: 1, purple: 2 };

export type VerificationProfile = {
  username: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  socials: { twitter?: string; discord?: string; website?: string; instagram?: string };
  /** Purple only — the reviewed identity document. */
  idDocumentUrl?: string;
};

/**
 * Everything still missing before `tier` can be applied for, as sentences
 * meant to be shown to the applicant. Empty means eligible.
 *
 * Returned as a list rather than a boolean so the form can show the whole
 * checklist at once instead of revealing one blocker at a time.
 */
export function verificationBlockers(
  tier: ApplicableTier,
  nftsCreated: number,
  profile: VerificationProfile
): string[] {
  const missing: string[] = [];
  const required = TIER_MIN_NFTS[tier];
  if (nftsCreated < required) {
    missing.push(`Create ${required} NFTs — you have ${nftsCreated}.`);
  }
  if (!profile.avatarUrl) missing.push("Add a profile image.");
  if (!profile.bannerUrl) missing.push("Add a cover image.");
  if (!profile.username?.trim()) missing.push("Set a username.");
  if ((profile.bio ?? "").trim().length < 40) missing.push("Write a bio of at least 40 characters.");
  // One real account is the point — a link people can check. Requiring all
  // four would exclude anyone who simply isn't on Discord.
  const socialCount = [profile.socials?.twitter, profile.socials?.discord, profile.socials?.website, profile.socials?.instagram]
    .filter((v) => !!v && v.trim().length > 0).length;
  if (socialCount === 0) missing.push("Link at least one social account or website.");
  if (tier === "purple" && !profile.idDocumentUrl) {
    missing.push("Upload a government-issued ID for identity verification.");
  }
  return missing;
}
