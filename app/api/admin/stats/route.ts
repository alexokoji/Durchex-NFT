import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Report } from "@/lib/models/Report";

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  await connectDB();
  const [userCount, collectionCount, itemCount, openReportCount, bannedUserCount, volumeAgg] = await Promise.all([
    User.countDocuments(),
    Collection.countDocuments(),
    Item.countDocuments(),
    Report.countDocuments({ status: { $in: ["open", "reviewing"] } }),
    User.countDocuments({ banned: true }),
    Collection.aggregate([{ $group: { _id: null, total: { $sum: "$stats.totalVolumeEth" } } }]),
  ]);

  return NextResponse.json({
    userCount,
    collectionCount,
    itemCount,
    openReportCount,
    bannedUserCount,
    totalVolumeEth: volumeAgg[0]?.total ?? 0,
  });
}
