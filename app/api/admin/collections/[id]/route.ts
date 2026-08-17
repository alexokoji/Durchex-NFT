import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { PlatformSettings } from "@/lib/models/PlatformSettings";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.verified === "boolean") update.verified = body.verified;
  if (typeof body.featured === "boolean") update.featured = body.featured;
  if (typeof body.hidden === "boolean") update.hidden = body.hidden;
  if (typeof body.royaltyBps === "number") {
    await connectDB();
    const settings = await PlatformSettings.findOne();
    const cap = settings?.royaltyCapBps ?? 3000;
    if (body.royaltyBps < 0 || body.royaltyBps > cap) {
      return NextResponse.json({ error: `royaltyBps must be between 0 and the platform cap (${cap})` }, { status: 400 });
    }
    update.royaltyBps = body.royaltyBps;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

  await connectDB();
  const collection = await Collection.findByIdAndUpdate(id, update, { new: true }).select(
    "slug name verified featured hidden royaltyBps"
  );
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  return NextResponse.json({ collection });
}
