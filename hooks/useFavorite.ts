"use client";

import { useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "@/hooks/useSession";

/**
 * Local optimistic favorite toggle. Cards are rendered in many places
 * (Home, Explore, Collection, related items) without the current user's
 * favorite state pre-loaded for every item on the page, so this starts
 * from the server-rendered count/state and only reflects this user's own
 * toggles for the rest of the session — the Profile page's Favorited tab
 * is the source of truth for "what have I favorited."
 */
export function useFavorite(itemId: string, initialCount: number) {
  const { user } = useSession();
  const { openConnectModal } = useConnectModal();
  const [favorited, setFavorited] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!user) {
      openConnectModal?.();
      return;
    }
    if (pending) return;
    setPending(true);
    const nextFavorited = !favorited;
    setFavorited(nextFavorited);
    setCount((c) => c + (nextFavorited ? 1 : -1));
    try {
      const res = await fetch(`/api/favorites/${itemId}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFavorited(data.favorited);
    } catch {
      // roll back on failure
      setFavorited(!nextFavorited);
      setCount((c) => c + (nextFavorited ? -1 : 1));
    } finally {
      setPending(false);
    }
  }

  return { favorited, count, toggle };
}
