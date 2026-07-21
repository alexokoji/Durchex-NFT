import Link from "next/link";
import { CategoryIcon, CATEGORY_LABELS, CategoryKey } from "@/components/ui/CategoryIcon";

export function CategoryBreakdown({ counts }: { counts: Record<string, number> }) {
  const categories = Object.keys(CATEGORY_LABELS) as CategoryKey[];
  const max = Math.max(1, ...categories.map((c) => counts[c] ?? 0));

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold text-white mb-5">Items by Category</h2>
      <div className="space-y-3.5">
        {categories
          .slice()
          .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
          .map((cat) => {
            const count = counts[cat] ?? 0;
            const pct = Math.max(4, (count / max) * 100);
            return (
              <Link
                key={cat}
                href={`/explore?category=${cat}`}
                className="flex items-center gap-3 group"
              >
                <CategoryIcon category={cat} size={28} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-white/70 group-hover:text-white transition">
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="text-white/40 tabular-nums">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-700 to-pink-purple transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
