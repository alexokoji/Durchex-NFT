import { Users, Images, Package, ShieldAlert, Ban, TrendingUp } from "lucide-react";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Report } from "@/lib/models/Report";
import { formatEth } from "@/lib/formatEth";

export const dynamic = "force-dynamic";

async function loadStats() {
  await connectDB();
  const [userCount, collectionCount, itemCount, openReportCount, bannedUserCount, volumeAgg] = await Promise.all([
    User.countDocuments(),
    Collection.countDocuments(),
    Item.countDocuments(),
    Report.countDocuments({ status: { $in: ["open", "reviewing"] } }),
    User.countDocuments({ banned: true }),
    Collection.aggregate([{ $group: { _id: null, total: { $sum: "$stats.totalVolumeEth" } } }]),
  ]);
  return {
    userCount,
    collectionCount,
    itemCount,
    openReportCount,
    bannedUserCount,
    totalVolumeEth: volumeAgg[0]?.total ?? 0,
  };
}

export default async function AdminOverviewPage() {
  const stats = await loadStats();
  const cards = [
    { label: "Users", value: stats.userCount, icon: Users },
    { label: "Collections", value: stats.collectionCount, icon: Images },
    { label: "Items", value: stats.itemCount, icon: Package },
    { label: "Open reports", value: stats.openReportCount, icon: ShieldAlert, alert: stats.openReportCount > 0 },
    { label: "Banned users", value: stats.bannedUserCount, icon: Ban },
    { label: "Total volume", value: formatEth(stats.totalVolumeEth, 3), icon: TrendingUp },
  ];

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <h1 className="font-display text-2xl font-semibold text-white mb-1">Overview</h1>
      <p className="text-sm text-white/45 mb-6">Platform-wide snapshot.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="surface-card p-5">
            <div className="flex items-center justify-between mb-3">
              <card.icon className={`w-5 h-5 ${card.alert ? "text-danger" : "text-purple-300"}`} />
            </div>
            <div className="text-2xl font-semibold text-white">{card.value}</div>
            <div className="text-xs text-white/45 mt-1">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
