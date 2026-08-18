"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { ActivityRow } from "@/components/activity/ActivityRow";
import { ActivityView } from "@/lib/types";
import { ActivityType } from "@/lib/queries";

export function ActivityFeed({
  initialActivity,
  initialPageCount,
  type,
  userId,
  collectionId,
  emptyLabel = "No activity yet.",
}: {
  initialActivity: ActivityView[];
  initialPageCount: number;
  type?: ActivityType;
  /** Scopes the feed (and its "load more") to one wallet's history. */
  userId?: string;
  /** Scopes the feed to a single collection. */
  collectionId?: string;
  emptyLabel?: string;
}) {
  const [activity, setActivity] = useState(initialActivity);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    const sp = new URLSearchParams();
    if (type) sp.set("type", type);
    if (userId) sp.set("user", userId);
    if (collectionId) sp.set("collection", collectionId);
    sp.set("page", String(page + 1));
    const res = await fetch(`/api/activity?${sp.toString()}`);
    const data = await res.json();
    setActivity((prev) => [...prev, ...data.activity]);
    setPage((p) => p + 1);
    setPageCount(data.pageCount);
    setLoading(false);
  }

  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Radio className="w-10 h-10 text-purple-500/40 mb-3" />
        <p className="text-sm text-white/40">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="surface-card p-2 sm:p-3">
      {activity.map((a) => (
        <ActivityRow key={a.id} activity={a} />
      ))}
      {page < pageCount && (
        <div className="flex justify-center pt-2 pb-1">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-purple-300 hover:text-white hover:bg-white/5 transition disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
