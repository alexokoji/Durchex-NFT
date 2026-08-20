"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface SessionUser {
  address: string;
  username: string;
  isVerified: boolean;
  verificationTier?: "none" | "white" | "purple";
  avatarUrl?: string;
  nextVoucherNonce: number;
}

async function fetchSession(): Promise<SessionUser | null> {
  const res = await fetch("/api/auth/session");
  const data = await res.json();
  return data.user ?? null;
}

export function useSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["session"] });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    refresh,
  };
}
