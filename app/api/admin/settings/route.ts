import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { PlatformSettings } from "@/lib/models/PlatformSettings";

// The platform fee itself (10%) is a Solidity constant in
// DurchexMarketplace.sol and can't be changed without a contract redeploy —
// surfaced here as read-only context, not something this route can edit.
const PLATFORM_FEE_BPS = 1000;

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  await connectDB();
  let settings = await PlatformSettings.findOne();
  if (!settings) settings = await PlatformSettings.create({});
  return NextResponse.json({ royaltyCapBps: settings.royaltyCapBps, platformFeeBps: PLATFORM_FEE_BPS });
}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const royaltyCapBps = Number(body.royaltyCapBps);
  if (!Number.isFinite(royaltyCapBps) || royaltyCapBps < 0 || royaltyCapBps > 5000) {
    return NextResponse.json({ error: "royaltyCapBps must be between 0 and 5000" }, { status: 400 });
  }

  await connectDB();
  const settings = await PlatformSettings.findOneAndUpdate({}, { royaltyCapBps }, { new: true, upsert: true });
  return NextResponse.json({ royaltyCapBps: settings.royaltyCapBps, platformFeeBps: PLATFORM_FEE_BPS });
}
