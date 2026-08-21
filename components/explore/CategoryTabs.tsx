import Link from "next/link";
import clsx from "clsx";
import { CategoryIcon, CATEGORY_LABELS, CategoryKey } from "@/components/ui/CategoryIcon";

function buildHref(base: URLSearchParams, category?: string) {
  const sp = new URLSearchParams(base);
  if (category) sp.set("category", category);
  else sp.delete("category");
  sp.delete("page");
  const qs = sp.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export function CategoryTabs({
  active,
  searchParams,
}: {
  active?: string;
  searchParams: Record<string, string | undefined>;
}) {
  const base = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const categories = Object.keys(CATEGORY_LABELS) as CategoryKey[];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-1">
      <Link
        href={buildHref(base, undefined)}
        className={clsx(
          "shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition",
          !active
            ? "bg-purple-700/20 border-purple-500/50 text-white"
            : "border-white/10 text-white/60 hover:text-white hover:border-white/20"
        )}
      >
        All
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat}
          href={buildHref(base, cat)}
          className={clsx(
            "shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium border transition",
            active === cat
              ? "bg-purple-700/20 border-purple-500/50 text-white"
              : "border-white/10 text-white/60 hover:text-white hover:border-white/20"
          )}
        >
          <CategoryIcon category={cat} size={22} />
          {CATEGORY_LABELS[cat]}
        </Link>
      ))}
    </div>
  );
}
