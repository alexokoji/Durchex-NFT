import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recordActivity } from "@/lib/activity";

// Lists or unlists an already-minted item for resale. Lazy (unminted) items
// get their listing price set at creation via the voucher — this is only
// for items that already exist on-chain and are owned by the caller.
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;

  await connectDB();
  const item = await Item.findById(id);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (String(item.owner) !== String(user._id)) {
    return NextResponse.json({ error: "Only the owner can list this item" }, { status: 403 });
  }
  if (!item.isMinted) {
    return NextResponse.json({ error: "Unminted items list automatically when created" }, { status: 400 });
  }

  const body = await req.json();
  if (body.action === "unlist") {
    item.status = "not_listed";
    item.priceEth = 0;
  } else {
    const priceEth = Number(body.priceEth);
    if (!Number.isFinite(priceEth) || priceEth <= 0) {
      return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
    }
    item.status = "fixed_price";
    item.priceEth = priceEth;
  }
  await item.save();

  if (item.status === "fixed_price") {
    await recordActivity({ type: "list", item: item._id, from: user._id, priceEth: item.priceEth });
  }

  return NextResponse.json({ id: String(item._id), status: item.status, priceEth: item.priceEth });
}
