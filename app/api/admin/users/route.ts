import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  await connectDB();
  const filter = q ? { $or: [{ username: { $regex: q, $options: "i" } }, { address: { $regex: q, $options: "i" } }] } : {};
  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .select("address username role banned banReason isVerified followerCount createdAt")
    .lean();
  return NextResponse.json({ users });
}
