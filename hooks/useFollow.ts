"use client";

import { useEffect, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "@/hooks/useSession";

export function useFollow(targetAddress: string, initialFollowerCount: number) {
  const { user } = useSession();
  const { openConnectModal } = useConnectModal();
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user || user.address === targetAddress) return;
    fetch(`/api/follow/${targetAddress}`)
      .then((r) => r.json())
      .then((d) => setFollowing(!!d.following));
  }, [user, targetAddress]);

  async function toggle() {
    if (!user) {
      openConnectModal?.();
      return;
    }
    if (pending) return;
    setPending(true);
    const next = !following;
    setFollowing(next);
    setFollowerCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/follow/${targetAddress}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFollowing(data.following);
    } catch {
      setFollowing(!next);
      setFollowerCount((c) => c + (next ? -1 : 1));
    } finally {
      setPending(false);
    }
  }

  return { following, followerCount, toggle, pending };
}
