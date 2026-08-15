import Link from "next/link";
import { BarChart3, Eye, Heart, Layers3, ShoppingBag, Sparkles, WalletCards } from "lucide-react";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";
import { getCreatorAnalytics } from "@/lib/queries";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

const stat = (value: number, label: string, icon: React.ReactNode) => (
  <div className="surface-card p-5" key={label}>
    <div className="flex items-center justify-between text-white/45 text-xs uppercase tracking-wider"><span>{label}</span>{icon}</div>
    <p className="font-display text-2xl font-semibold text-white mt-3">{value.toLocaleString()}</p>
  </div>
);

export default async function CreatorPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) return null;
  const analytics = await getCreatorAnalytics(String(user._id));
  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-9">
        <div><p className="text-purple-300 text-sm font-medium mb-2">Creator studio</p><h1 className="font-display text-3xl sm:text-4xl font-semibold text-white">Performance overview</h1><p className="text-sm text-white/50 mt-2">A live view of your collections and listings on Durchex.</p></div>
        <Button href="/create" size="sm" icon={<Sparkles className="w-4 h-4" />}>Create NFT</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {stat(analytics.collections, "Collections", <Layers3 className="w-4 h-4" />)}
        {stat(analytics.items, "Items created", <WalletCards className="w-4 h-4" />)}
        {stat(analytics.views, "Total views", <Eye className="w-4 h-4" />)}
        {stat(analytics.favorites, "Favorites", <Heart className="w-4 h-4" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-5 mb-8">
        <div className="surface-card p-6 lg:col-span-2"><div className="flex items-center gap-2 text-white/50 text-sm"><BarChart3 className="w-4 h-4 text-purple-300" />Trading performance</div><div className="grid sm:grid-cols-3 gap-6 mt-5"><div><p className="font-display text-2xl text-white">{analytics.totalVolumeEth.toFixed(3)} ETH</p><p className="text-xs text-white/40 mt-1">All-time volume</p></div><div><p className="font-display text-2xl text-white">{analytics.volumeLast30DaysEth.toFixed(3)} ETH</p><p className="text-xs text-white/40 mt-1">Sales volume, 30 days</p></div><div><p className="font-display text-2xl text-white">{analytics.sales.toLocaleString()}</p><p className="text-xs text-white/40 mt-1">Recorded sales</p></div></div></div>
        <div className="surface-card p-6"><p className="text-sm text-white/50">Listing health</p><p className="font-display text-3xl text-white mt-2">{analytics.listed}<span className="text-base text-white/40"> / {analytics.items}</span></p><p className="text-xs text-white/40 mt-1">active listings</p><div className="h-2 rounded-full bg-white/8 overflow-hidden mt-5"><div className="h-full bg-gradient-to-r from-purple-600 to-pink-purple" style={{ width: `${analytics.items ? Math.round((analytics.listed / analytics.items) * 100) : 0}%` }} /></div><p className="text-xs text-white/40 mt-3">{analytics.minted} minted on-chain</p></div>
      </div>
      <div className="surface-card overflow-hidden"><div className="p-6 flex items-center justify-between"><div><h2 className="font-display text-xl text-white">Collection performance</h2><p className="text-sm text-white/45 mt-1">Sales and ownership metrics by collection.</p></div></div>{analytics.collectionPerformance.length === 0 ? <div className="px-6 pb-8 text-sm text-white/45">Create your first collection to start tracking performance.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y border-white/8 text-left text-xs uppercase tracking-wider text-white/35"><tr><th className="p-4 pl-6">Collection</th><th className="p-4">Items</th><th className="p-4">Owners</th><th className="p-4">Floor</th><th className="p-4 pr-6">Volume</th></tr></thead><tbody>{analytics.collectionPerformance.map((collection) => <tr key={collection.id} className="border-b border-white/5 last:border-0 text-white/65"><td className="p-4 pl-6"><Link className="text-white hover:text-purple-300" href={`/collection/${collection.slug}`}>{collection.name}</Link></td><td className="p-4">{collection.items}</td><td className="p-4">{collection.owners}</td><td className="p-4">{collection.floorEth.toFixed(3)} ETH</td><td className="p-4 pr-6">{collection.totalVolumeEth.toFixed(3)} ETH</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
}
