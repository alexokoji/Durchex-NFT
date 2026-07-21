import { getActivity, ActivityType } from "@/lib/queries";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { ActivityFilterTabs } from "@/components/activity/ActivityFilterTabs";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

const VALID_TYPES: ActivityType[] = ["sale", "list", "bid", "offer", "mint", "transfer", "cancel"];

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function ActivityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const type = VALID_TYPES.includes(sp.type as ActivityType)
    ? (sp.type as ActivityType)
    : undefined;

  const { activity, pageCount } = await getActivity({ type, page: 1 });

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">Activity</h1>
      <p className="text-white/50 text-sm mb-6">
        Live feed of listings, sales, bids and offers across Durchex.
      </p>

      <div className="mb-6">
        <ActivityFilterTabs active={type} />
      </div>

      <ActivityFeed initialActivity={activity} initialPageCount={pageCount} type={type} />
    </div>
  );
}
