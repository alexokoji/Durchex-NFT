import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { Item } from "@/lib/models/Item";
import { VerificationRequest } from "@/lib/models/VerificationRequest";
import {
  APPLICABLE_TIERS,
  ApplicableTier,
  TIER_MIN_NFTS,
  TIER_RANK,
  verificationBlockers,
} from "@/lib/verification";

export const dynamic = "force-dynamic";

function profileOf(user: {
  username: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  socials?: Record<string, string | undefined>;
}) {
  return {
    username: user.username,
    bio: user.bio ?? "",
    avatarUrl: user.avatarUrl ?? "",
    bannerUrl: user.bannerUrl ?? "",
    socials: {
      twitter: user.socials?.twitter ?? "",
      discord: user.socials?.discord ?? "",
      website: user.socials?.website ?? "",
      instagram: user.socials?.instagram ?? "",
    },
  };
}

// Where the signed-in user stands: current tier, how many NFTs they've
// created, what each tier still needs, and any application in flight.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await connectDB();

  const nftsCreated = await Item.countDocuments({ creator: user._id });
  const profile = profileOf(user);
  const pending = await VerificationRequest.findOne({ user: user._id, status: "pending" }).lean();
  const lastDecision = await VerificationRequest.findOne({
    user: user._id,
    status: { $in: ["approved", "rejected"] },
  })
    .sort({ reviewedAt: -1 })
    .lean();

  return NextResponse.json({
    tier: user.verificationTier ?? "none",
    nftsCreated,
    thresholds: TIER_MIN_NFTS,
    profile,
    blockers: {
      white: verificationBlockers("white", nftsCreated, profile),
      purple: verificationBlockers("purple", nftsCreated, { ...profile, idDocumentUrl: "" }),
    },
    pending: pending ? { tier: pending.tier, createdAt: pending.createdAt } : null,
    lastDecision: lastDecision
      ? { tier: lastDecision.tier, status: lastDecision.status, note: lastDecision.reviewNote }
      : null,
  });
}

// Apply for a badge. The eligibility rules are re-checked here rather than
// trusted from the form, and an ID is required for purple.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await connectDB();

  const body = await req.json().catch(() => ({}));
  const tier = body.tier as ApplicableTier;
  if (!APPLICABLE_TIERS.includes(tier)) {
    return NextResponse.json({ error: "Pick a verification tier to apply for." }, { status: 400 });
  }
  const current = (user.verificationTier ?? "none") as keyof typeof TIER_RANK;
  if (TIER_RANK[current] >= TIER_RANK[tier]) {
    return NextResponse.json(
      { error: "You already hold this badge or a higher one." },
      { status: 409 }
    );
  }

  const idDocumentUrl = String(body.idDocumentUrl ?? "").trim();
  const nftsCreated = await Item.countDocuments({ creator: user._id });
  const profile = { ...profileOf(user), idDocumentUrl };
  const blockers = verificationBlockers(tier, nftsCreated, profile);
  if (blockers.length > 0) {
    return NextResponse.json({ error: "Your application isn't complete yet.", blockers }, { status: 400 });
  }

  // Reapplying replaces the open application instead of queueing a second,
  // so a reviewer never sees two versions of the same person.
  const request = await VerificationRequest.findOneAndUpdate(
    { user: user._id, status: "pending" },
    {
      user: user._id,
      tier,
      status: "pending",
      nftsCreated,
      submitted: profile,
      reviewNote: "",
      reviewedBy: null,
      reviewedAt: null,
    },
    { new: true, upsert: true }
  );

  return NextResponse.json({ id: String(request._id), tier: request.tier, status: request.status });
}
