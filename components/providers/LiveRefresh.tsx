"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a page current without the reader doing anything.
 *
 * Prices, listings and offers change from other people's transactions, so
 * a marketplace page is stale the moment it renders — and until now the
 * only way to see that was to reload, which is a poor thing to ask of
 * someone deciding whether to buy.
 *
 * router.refresh() re-renders the server components in place: it keeps
 * scroll position, focus and anything typed into a form, which a reload
 * would throw away mid-purchase.
 *
 * Two rules keep it from being a nuisance. It stops while the tab is
 * hidden, because refreshing a page nobody is looking at only spends the
 * reader's battery and our database. And it refreshes once immediately on
 * return, since a tab left open for an hour is exactly the one showing
 * the most stale prices.
 */
const EVENT = "durchex:refresh";

/** Client-side lists subscribe to this to refetch alongside the page. */
export function onLiveRefresh(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function LiveRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      // Server components re-render from this; client-side lists listen
      // for the event, so both halves of the page move together rather
      // than one lagging a cycle behind the other.
      router.refresh();
      window.dispatchEvent(new Event(EVENT));
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
