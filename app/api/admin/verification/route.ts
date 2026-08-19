import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { VerificationRequest } from "@/lib/models/VerificationRequest";

export const dynamic = "force-dynamic";

// The review queue. Pending first — those are the ones waiting on a human.
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });
  await connectDB();

  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const filter = status === "all" ? {} : { status };
  const docs = await VerificationRequest.find(filter)
    .sort({ status: 1, createdAt: -1 })
    .limit(100)
    .populate("user", "address username verificationTier")
    .lean();

  return NextResponse.json({
    requests: docs.map((d) => ({
      _id: String(d._id),
      tier: d.tier,
      status: d.status,
      nftsCreated: d.nftsCreated,
      submitted: d.submitted,
      reviewNote: d.reviewNote,
      createdAt: d.createdAt,
      reviewedAt: d.reviewedAt,
      user: d.user
        ? {
            _id: String((d.user as { _id: unknown })._id),
            address: (d.user as { address: string }).address,
            username: (d.user as { username: string }).username,
            verificationTier: (d.user as { verificationTier?: string }).verificationTier ?? "none",
          }
        : null,
    })),
  });
}
