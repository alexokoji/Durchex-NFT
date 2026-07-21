import { SectionHeading } from "@/components/home/SectionHeading";
import { DropCard } from "@/components/drops/DropCard";
import { DropView } from "@/lib/types";

export function FeaturedDrops({ drops }: { drops: DropView[] }) {
  if (drops.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <SectionHeading eyebrow="Curated" title="Featured Drops" href="/drops" />
      <div className="grid sm:grid-cols-2 gap-6">
        {drops.slice(0, 2).map((d) => (
          <DropCard key={d.id} drop={d} />
        ))}
      </div>
    </section>
  );
}
