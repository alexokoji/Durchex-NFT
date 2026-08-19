import { PlatformSettings } from "@/lib/models/PlatformSettings";

export type CreationGate = { allowed: true } | { allowed: false; error: string };

/**
 * Whether a wallet may create collections or items right now.
 *
 * Creation is open by default. An admin can close it platform-wide while
 * the marketplace is being seeded; the allowlist is what keeps the team
 * working through that window, so closing it doesn't also close it to us.
 *
 * Read on every create rather than cached — the point of the switch is
 * that flipping it takes effect immediately.
 */
export async function checkCreationAllowed(address: string): Promise<CreationGate> {
  const settings = await PlatformSettings.findOne().select("creationEnabled creationAllowlist").lean();
  // No settings row yet means nothing has ever been configured, which is
  // the open default rather than a lockout.
  if (!settings || settings.creationEnabled !== false) return { allowed: true };
  const allowlist = (settings.creationAllowlist ?? []).map((a: string) => a.toLowerCase());
  if (allowlist.includes(address.toLowerCase())) return { allowed: true };
  return {
    allowed: false,
    error: "Creating is closed while Durchex is in its launch phase. It will open to everyone shortly.",
  };
}
