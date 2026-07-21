import Link from "next/link";
import { SectionHeading } from "@/components/home/SectionHeading";
import { CategoryIcon, CATEGORY_LABELS, CategoryKey } from "@/components/ui/CategoryIcon";

export function CategoryGrid({ counts }: { counts: Record<string, number> }) {
  const categories = Object.keys(CATEGORY_LABELS) as CategoryKey[];
  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <SectionHeading eyebrow="Browse" title="Explore by Category" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {categories.map((cat) => (
          <Link
            key={cat}
            href={`/explore?category=${cat}`}
            className="surface-card surface-card-hover flex flex-col items-center justify-center gap-3 py-8 px-4 text-center"
          >
            <CategoryIcon category={cat} size={48} />
            <div>
              <div className="text-sm font-semibold text-white">{CATEGORY_LABELS[cat]}</div>
              <div className="text-[11px] text-white/40 mt-0.5">
                {(counts[cat] ?? 0).toLocaleString()} items
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
