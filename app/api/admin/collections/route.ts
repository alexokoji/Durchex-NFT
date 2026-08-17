import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  await connectDB();
  const filter = q ? { $or: [{ name: { $regex: q, $options: "i" } }, { slug: { $regex: q, $options: "i" } }] } : {};
  const collections = await Collection.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .select("slug name category verified featured hidden listingEnabled royaltyBps stats.items stats.owners stats.totalVolumeEth")
    .lean();
  return NextResponse.json({ collections });
}
