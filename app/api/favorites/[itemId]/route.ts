import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { Favorite } from "@/lib/models/Favorite";
import { getCurrentUser } from "@/lib/auth/currentUser";

export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to favorite items" }, { status: 401 });
  }

  const { itemId } = await params;
  await connectDB();

  const existing = await Favorite.findOne({ user: user._id, item: itemId });
  if (existing) {
    await Favorite.deleteOne({ _id: existing._id });
    await Item.updateOne({ _id: itemId }, { $inc: { favoriteCount: -1 } });
    return NextResponse.json({ favorited: false });
  }

  await Favorite.create({ user: user._id, item: itemId });
  await Item.updateOne({ _id: itemId }, { $inc: { favoriteCount: 1 } });
  return NextResponse.json({ favorited: true });
}
