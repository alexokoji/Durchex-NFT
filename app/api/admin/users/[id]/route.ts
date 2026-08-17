import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";

const ROLES = ["user", "moderator", "admin"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid user" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.banned === "boolean") {
    update.banned = body.banned;
    update.banReason = body.banned ? String(body.banReason ?? "").trim().slice(0, 300) : "";
  }
  if (typeof body.role === "string" && ROLES.includes(body.role)) update.role = body.role;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  await connectDB();
  const user = await User.findByIdAndUpdate(id, update, { new: true }).select("address username role banned banReason");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ user });
}
