import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { VerificationRequest } from "@/lib/models/VerificationRequest";
import { User } from "@/lib/models/User";

// Approve or reject one application. Approving is what actually grants the
// badge — the tier lives on the User, so nothing downstream has to consult
// the request queue to know whether someone is verified.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const decision = body.decision as "approved" | "rejected";
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "Decision must be approved or rejected" }, { status: 400 });
  }

  await connectDB();
  const request = await VerificationRequest.findById(id);
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.status !== "pending") {
    return NextResponse.json({ error: "This application has already been decided." }, { status: 409 });
  }

  request.status = decision;
  request.reviewNote = String(body.note ?? "").slice(0, 500);
  request.reviewedBy = admin._id;
  request.reviewedAt = new Date();
  // An identity document is kept only as long as it's under review. Once
  // a decision is made there is no reason for us to still hold it.
  if (request.submitted) request.submitted.idDocumentUrl = "";
  await request.save();

  if (decision === "approved") {
    await User.updateOne(
      { _id: request.user },
      { verificationTier: request.tier, isVerified: true }
    );
  }

  return NextResponse.json({ id: String(request._id), status: request.status });
}
