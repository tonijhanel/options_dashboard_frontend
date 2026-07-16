/**
 * Total real-dollar entry debit for an open hedge position - sums every
 * spread leg's entry_debit * contracts * 100 plus the tail put's own
 * entry_debit * contracts * 100. entry_debit is stored as a per-share
 * price (not a dollar total), mirroring the backend's
 * hedge_roll_service._dollar_value scaling.
 */
export function computeHedgeEntryDebit(openPosition) {
  if (!openPosition) return 0;
  const spreadTotal = (openPosition.spread_legs || []).reduce(
    (sum, leg) => sum + (leg.entry_debit || 0) * (leg.contracts || 0) * 100,
    0
  );
  const tailTotal = (openPosition.tail_put_entry_debit || 0) * (openPosition.tail_put_contracts || 0) * 100;
  return spreadTotal + tailTotal;
}

/** "715/695 x1, 705/685 x1, Tail Put 660 x1" - used by the Positions-page hedge banner. */
export function formatHedgeLegsSummary(openPosition) {
  if (!openPosition) return '';
  const spreadParts = (openPosition.spread_legs || []).map(
    (leg) => `${leg.long_strike}/${leg.short_strike} x${leg.contracts}`
  );
  const tailPart = `Tail Put ${openPosition.tail_put_strike} x${openPosition.tail_put_contracts}`;
  return [...spreadParts, tailPart].join(', ');
}
