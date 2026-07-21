import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Follow } from "@/lib/models/Follow";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { createNotification } from "@/lib/notifications";

export async function GET(req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ following: false });

  const { address } = await params;
  await connectDB();
  const target = await User.findOne({ address: address.toLowerCase() }).select("_id").lean();
  if (!target) return NextResponse.json({ following: false });

  const existing = await Follow.exists({ follower: user._id, following: target._id });
  return NextResponse.json({ following: !!existing });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to follow creators" }, { status: 401 });
  }

  const { address } = await params;
  await connectDB();

  const target = await User.findOne({ address: address.toLowerCase() });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (String(target._id) === String(user._id)) {
    return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
  }

  const existing = await Follow.findOne({ follower: user._id, following: target._id });
  if (existing) {
    await Follow.deleteOne({ _id: existing._id });
    await Promise.all([
      User.updateOne({ _id: user._id }, { $inc: { followingCount: -1 } }),
      User.updateOne({ _id: target._id }, { $inc: { followerCount: -1 } }),
    ]);
    return NextResponse.json({ following: false });
  }

  await Follow.create({ follower: user._id, following: target._id });
  await Promise.all([
    User.updateOne({ _id: user._id }, { $inc: { followingCount: 1 } }),
    User.updateOne({ _id: target._id }, { $inc: { followerCount: 1 } }),
    createNotification({ user: target._id, type: "follow", fromUser: user._id }),
  ]);
  return NextResponse.json({ following: true });
}
