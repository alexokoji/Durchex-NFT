import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Notification } from "@/lib/models/Notification";
import { getCurrentUser } from "@/lib/auth/currentUser";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();
  await Notification.updateOne({ _id: id, user: user._id }, { $set: { read: true } });
  return NextResponse.json({ ok: true });
}
