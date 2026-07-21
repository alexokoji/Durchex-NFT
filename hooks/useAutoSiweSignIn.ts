"use client";

import { useAccount, useSignMessage } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SiweMessage } from "siwe";
import { useSession } from "@/hooks/useSession";

interface SiweResult {
  address: string;
  username: string;
  isVerified: boolean;
  isNewUser: boolean;
}

/**
 * Signs the connected wallet in automatically (no separate "Sign In" button):
 * as soon as a wallet connects and there's no active server session yet, this
 * silently requests a nonce, asks the wallet to sign the SIWE message, and
 * verifies it. Implemented as a react-query `useQuery` (not a manual effect)
 * so that every component calling this hook — e.g. the desktop and mobile
 * copies of the connect button that can both be mounted at once — shares one
 * in-flight request and one result instead of racing each other.
 */
export function useAutoSiweSignIn() {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { user, isLoading: sessionLoading, refresh } = useSession();
  const queryClient = useQueryClient();

  const enabled = isConnected && !!address && !!chainId && !sessionLoading && !user;

  const query = useQuery<SiweResult>({
    queryKey: ["siwe-auto-signin", address],
    queryFn: async () => {
      const nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
      const { nonce } = await nonceRes.json();

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: address!,
        statement: "Sign in to Durchex to create listings, place bids and manage your profile.",
        uri: window.location.origin,
        version: "1",
        chainId: chainId!,
        nonce,
      });
      const message = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Sign-in failed");
      }
      const data: SiweResult = await verifyRes.json();
      refresh();
      return data;
    },
    enabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  const retry = () => {
    queryClient.removeQueries({ queryKey: ["siwe-auto-signin", address] });
    query.refetch();
  };

  return {
    isSigningIn: enabled && query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    isNewUser: query.data?.isNewUser ?? false,
    retry,
  };
}
