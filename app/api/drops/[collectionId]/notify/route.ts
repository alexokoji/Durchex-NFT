import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DropNotify } from "@/lib/models/DropNotify";
import { getCurrentUser } from "@/lib/auth/currentUser";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to get notified about this drop" }, { status: 401 });
  }

  const { collectionId } = await params;
  await connectDB();

  const existing = await DropNotify.findOne({ user: user._id, collection: collectionId });
  if (existing) {
    await DropNotify.deleteOne({ _id: existing._id });
    const count = await DropNotify.countDocuments({ collection: collectionId });
    return NextResponse.json({ notifying: false, count });
  }

  await DropNotify.create({ user: user._id, collection: collectionId });
  const count = await DropNotify.countDocuments({ collection: collectionId });
  return NextResponse.json({ notifying: true, count });
}
