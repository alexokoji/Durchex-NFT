import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { getCurrentUser } from "@/lib/auth/currentUser";

// The signed-in wallet's held quantity of an ERC-1155 item — used to gate
// "list for resale" (can't list more than you hold) and to show "You own X".
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ quantity: 0 });
  const { id } = await context.params;

  await connectDB();
  const balance = await ItemBalance.findOne({ item: id, owner: user._id }).lean();
  return NextResponse.json({ quantity: balance?.quantity ?? 0 });
}
