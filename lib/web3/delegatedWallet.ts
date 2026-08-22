import { isAddress, type Address } from "viem";
import { rpcClient } from "@/lib/web3/reconcile";

/**
 * Whether a wallet has had its code delegated under EIP-7702.
 *
 * A normal wallet has no code. EIP-7702 lets one sign an authorization that
 * installs a contract's behaviour at its own address, and the account then
 * reads back as 23 bytes: the marker 0xef0100 followed by the 20-byte
 * address it delegates to.
 *
 * That mechanism is legitimate — it is how smart accounts add batching and
 * gas sponsorship to an existing address. It is also how drainers work now.
 * Rather than needing the victim to approve each asset, the attacker gets
 * one signature and installs a sweeper, after which every wei that arrives
 * leaves in the same transaction.
 *
 * Durchex learned this the expensive way: a creator wallet was delegated to
 * a sweeper, and because the marketplace pays primary-sale proceeds and
 * royalties straight to the creator address, every mint of their collection
 * paid the attacker instead. The royalty receiver is stamped into the token
 * at first mint and cannot be changed afterwards, so by the time anyone
 * noticed, that collection's royalties were permanently misdirected.
 *
 * Hence this check runs *before* an address can become a payout target,
 * which is the only moment the damage is still preventable.
 */
export const DELEGATION_PREFIX = "0xef0100";

export type DelegationCheck =
  | { delegated: false; checked: boolean }
  | { delegated: true; checked: true; target: Address };

/** Pulls the delegation target out of an account's code, if it has one. */
export function parseDelegation(code: string | undefined | null): Address | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  // Exactly 23 bytes — prefix plus one address. Anything longer is an
  // ordinary contract that merely happens to start with those bytes.
  if (!lower.startsWith(DELEGATION_PREFIX) || lower.length !== 2 + 23 * 2) return null;
  return `0x${lower.slice(DELEGATION_PREFIX.length)}` as Address;
}

/**
 * Reads an address's code on-chain and reports any 7702 delegation.
 *
 * `checked` is false when there was no usable RPC or the call failed. That
 * is deliberately distinct from "not delegated": callers decide whether an
 * unverifiable address should be allowed through, and blocking creation
 * because an RPC blipped would be the wrong trade.
 */
export async function checkDelegation(
  address: string,
  chainId: number
): Promise<DelegationCheck> {
  if (!isAddress(address)) return { delegated: false, checked: false };
  const client = rpcClient(chainId);
  if (!client) return { delegated: false, checked: false };

  try {
    const code = await client.getCode({ address: address as Address });
    const target = parseDelegation(code);
    return target ? { delegated: true, checked: true, target } : { delegated: false, checked: true };
  } catch {
    return { delegated: false, checked: false };
  }
}

/** The message shown to someone whose wallet is carrying a sweeper. */
export function delegationWarning(target: Address): string {
  return (
    "This wallet has delegated its code to another contract (EIP-7702), at " +
    `${target}. Durchex pays sale proceeds and royalties straight to the ` +
    "creator's address, and a delegation like this can forward them " +
    "elsewhere the moment they arrive — so it cannot be used to create. " +
    "If you did not set this up, treat the wallet as compromised: move any " +
    "assets out and switch to a wallet created on a clean device."
  );
}
