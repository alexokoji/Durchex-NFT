"use client";

import { useState } from "react";
import { useAutoSiweSignIn } from "@/hooks/useAutoSiweSignIn";
import { OnboardingModal } from "@/components/wallet/OnboardingModal";

/**
 * Mounted once near the root of the app. Owns the single source of truth for
 * "should the new-user onboarding modal be visible" — kept separate from
 * ConnectWalletButton so it renders exactly once even though the connect
 * button itself can be mounted twice (desktop + mobile nav).
 */
export function AutoAuthGate() {
  const { isNewUser } = useAutoSiweSignIn();
  const [dismissed, setDismissed] = useState(false);

  if (!isNewUser || dismissed) return null;

  return <OnboardingModal onClose={() => setDismissed(true)} />;
}
