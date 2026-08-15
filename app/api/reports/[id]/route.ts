import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getAdminFromRequest } from "@/lib/auth/admin";
import { connectDB } from "@/lib/db";
import { Report } from "@/lib/models/Report";

const STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid report" }, { status: 400 });

  const body = await req.json();
  if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid moderation status" }, { status: 400 });
  await connectDB();
  const report = await Report.findByIdAndUpdate(
    id,
    { status: body.status, reviewedBy: admin._id, resolutionNote: String(body.resolutionNote ?? "").trim().slice(0, 1200) },
    { new: true }
  );
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  return NextResponse.json({ id: String(report._id), status: report.status });
}
