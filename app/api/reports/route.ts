import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { Report } from "@/lib/models/Report";

const REASONS = ["copyright", "counterfeit", "explicit", "spam", "harassment", "other"] as const;

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status");
  await connectDB();
  const reports = await Report.find(status ? { status } : {})
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("reporter", "username address")
    .populate("reviewedBy", "username")
    .lean();
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to submit a report" }, { status: 401 });

  const body = await req.json();
  const targetType = String(body.targetType ?? "");
  const targetId = String(body.targetId ?? "");
  const reason = String(body.reason ?? "");
  const details = String(body.details ?? "").trim();
  if (!(["item", "collection", "user"] as string[]).includes(targetType) || !Types.ObjectId.isValid(targetId) || !REASONS.includes(reason as (typeof REASONS)[number])) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  await connectDB();
  const duplicate = await Report.exists({ reporter: user._id, targetType, targetId, status: { $in: ["open", "reviewing"] } });
  if (duplicate) return NextResponse.json({ error: "You already have an open report for this content" }, { status: 409 });

  const report = await Report.create({ reporter: user._id, targetType, targetId, reason, details });
  return NextResponse.json({ id: String(report._id), status: report.status }, { status: 201 });
}
