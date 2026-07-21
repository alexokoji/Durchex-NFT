import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Notification } from "@/lib/models/Notification";
import { getCurrentUser } from "@/lib/auth/currentUser";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  await connectDB();
  await Notification.updateMany({ user: user._id, read: false }, { $set: { read: true } });
  return NextResponse.json({ ok: true });
}
