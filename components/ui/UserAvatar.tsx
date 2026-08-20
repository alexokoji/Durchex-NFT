import { GeneratedArt } from "@/components/nft/GeneratedArt";

/**
 * A wallet's picture, wherever one appears next to a username.
 *
 * Uploaded avatars were only rendered on the profile page itself, so the
 * same person showed generated art everywhere else — offers, activity,
 * search, notifications — and looked like a different account in each
 * place. One component so that can't drift again.
 *
 * The generated art stays as the fallback rather than a grey placeholder:
 * it is deterministic on the address, so a wallet with no upload still
 * looks like itself consistently.
 */
export function UserAvatar({
  address,
  avatarUrl,
  className = "w-8 h-8",
  seedKey,
}: {
  address: string;
  avatarUrl?: string | null;
  /** Overrides the seed when the caller keyed its art on something else. */
  seedKey?: string;
  className?: string;
}) {
  return (
    <span className={`${className} rounded-full overflow-hidden shrink-0 block bg-white/5`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <GeneratedArt seedKey={seedKey ?? address} className="w-full h-full" />
      )}
    </span>
  );
}
