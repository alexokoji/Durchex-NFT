import { Rocket } from "lucide-react";
import { getDrops } from "@/lib/queries";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";
import { DropCard } from "@/components/drops/DropCard";

export default async function DropsPage() {
  const user = await getCurrentUserFromCookies();
  const drops = await getDrops(user ? String(user._id) : undefined);

  const live = drops.filter((d) => d.isLive);
  const upcoming = drops.filter((d) => !d.isLive);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">Drops</h1>
      <p className="text-white/50 text-sm mb-10">
        Curated collection launches, live and upcoming.
      </p>

      {drops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Rocket className="w-12 h-12 text-purple-500/40 mb-4" />
          <p className="text-sm text-white/40">No drops scheduled right now — check back soon.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {live.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live Now
              </h2>
              <div className="grid sm:grid-cols-2 gap-6">
                {live.map((d) => (
                  <DropCard key={d.id} drop={d} />
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-5">Upcoming</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                {upcoming.map((d) => (
                  <DropCard key={d.id} drop={d} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
