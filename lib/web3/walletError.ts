/**
 * Turns a wallet or contract failure into the one line worth showing, or
 * nothing at all.
 *
 * Two problems this exists to solve. Rejecting a transaction in your
 * wallet is a deliberate act, not an error — reporting it back tells the
 * user something they already know and makes a normal choice look like a
 * fault, so it returns null and the caller shows nothing. And viem's
 * errors are multi-paragraph dumps with the request body and version
 * number in them; a caller that renders `err.message` puts all of that on
 * screen.
 */
export function walletError(err: unknown, fallback: string): string | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");

  // Every wallet phrases this differently, and none of them are worth
  // surfacing.
  if (/user rejected|user denied|rejected the request|denied transaction|action_rejected/i.test(raw)) {
    return null;
  }

  if (/insufficient funds/i.test(raw)) return "Not enough ETH to cover this and gas.";
  if (/chain mismatch|wrong network/i.test(raw)) return "Switch to the right network and try again.";

  // A contract's own reason is the most useful thing available, and it is
  // buried several lines into viem's output.
  const reason = raw.match(/reverted with the following reason:[\s]*(.+)/i)?.[1]?.trim();
  if (reason) return reason.replace(/^[A-Za-z]+:\s*/, "");

  const firstLine = raw.split("\n")[0]?.trim();
  // Anything still long enough to be a dump rather than a sentence is
  // replaced by the caller's own wording.
  return firstLine && firstLine.length <= 140 ? firstLine : fallback;
}
