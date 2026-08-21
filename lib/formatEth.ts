/**
 * One way to write an ETH amount.
 *
 * Every screen that rolled its own toFixed eventually rounded a real
 * figure to zero: a 0.00093 floor became "0.00", and 0.0176 of total
 * volume became "0 ETH" and read as a marketplace that had never traded.
 * The numbers were right each time; the rendering threw them away.
 *
 * So the rule lives here, once, and both the client currency formatter and
 * the server-rendered pages call it: fixed decimals for legibility, but
 * never at the cost of showing zero where there is a real amount.
 */
export function formatEthAmount(eth: number, decimals = 2): string {
  if (!Number.isFinite(eth) || eth === 0) return "0";

  const fixed = eth.toFixed(decimals);
  if (Number(fixed) !== 0) return String(Number(fixed));

  // Enough places to reach the first significant digit, then Number()
  // trims the padding zeros — 0.00080 is not how anyone writes eight
  // ten-thousandths. toFixed rather than toPrecision because the latter
  // returns exponent form on small numbers, which nobody reads as a price.
  const places = Math.min(18, Math.max(decimals, -Math.floor(Math.log10(Math.abs(eth))) + 1));
  return String(Number(eth.toFixed(places)));
}

/** The same amount with its unit, for places that always show ETH. */
export function formatEth(eth: number, decimals = 2): string {
  return `${formatEthAmount(eth, decimals)} ETH`;
}
