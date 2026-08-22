import { PlatformSettings } from "@/lib/models/PlatformSettings";
import { checkDelegation, delegationWarning } from "@/lib/web3/delegatedWallet";
import { DEFAULT_NFT_CHAIN_ID } from "@/lib/web3/deployedContract";

export type CreationGate = { allowed: true } | { allowed: false; error: string };

/**
 * Whether a wallet may create collections or items right now.
 *
 * Two separate questions, both answered here because every create route
 * already funnels through this one call.
 *
 * The first is policy: creation is open by default, and an admin can close
 * it platform-wide while the marketplace is being seeded. The allowlist is
 * what keeps the team working through that window, so closing it doesn't
 * also close it to us. Read on every create rather than cached — the point
 * of the switch is that flipping it takes effect immediately.
 *
 * The second is safety: a wallet carrying an EIP-7702 delegation must never
 * become a payout address. See lib/web3/delegatedWallet.ts for why that is
 * not hypothetical here. This check is ordered *after* the policy check so
 * a closed platform still answers instantly without an RPC round trip.
 */
export async function checkCreationAllowed(address: string): Promise<CreationGate> {
  const settings = await PlatformSettings.findOne().select("creationEnabled creationAllowlist").lean();
  // No settings row yet means nothing has ever been configured, which is
  // the open default rather than a lockout.
  const openToEveryone = !settings || settings.creationEnabled !== false;
  if (!openToEveryone) {
    const allowlist = (settings!.creationAllowlist ?? []).map((a: string) => a.toLowerCase());
    if (!allowlist.includes(address.toLowerCase())) {
      return {
        allowed: false,
        error: "Creating is closed while Durchex is in its launch phase. It will open to everyone shortly.",
      };
    }
  }

  // Applies to the allowlist too. Being trusted staff is no protection
  // against a compromised key — it was a launch wallet this happened to.
  const delegation = await checkDelegation(address, DEFAULT_NFT_CHAIN_ID);
  if (delegation.delegated) {
    return { allowed: false, error: delegationWarning(delegation.target) };
  }

  return { allowed: true };
}
