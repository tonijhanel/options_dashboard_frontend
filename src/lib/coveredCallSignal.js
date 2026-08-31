/**
 * lib/coveredCallSignal.js
 * -------------------------
 * Direct JS port of backend/services/covered_call_signal.py's
 * compute_status(). Same reasoning as lib/positionSignal.js (CSP's port):
 * the take-profit threshold is a user preference (the profit-target
 * slider), not a fact about the position, so it's applied here rather
 * than baked into the API response.
 *
 * The ITM comparison is INVERTED from positionSignal.js's CSP version -
 * a covered call's risk is the stock being called away (spot ABOVE
 * strike), the opposite of a CSP's assignment risk (spot BELOW strike).
 *
 * Keep this in exact sync with covered_call_signal.py if that file ever
 * changes.
 */

export function computeStatus(entryPrice, currentCallMid, spot, strike, dte, profitTargetPct = 80) {
  const ptScalar = profitTargetPct / 100;
  const dynamicTargetBuyback = entryPrice * (1 - ptScalar);

  if (currentCallMid <= dynamicTargetBuyback) {
    return { label: `Take Profit (${Math.round(profitTargetPct)}%)`, tone: 'take-profit' };
  }
  if (dte <= 1 && spot > strike) {
    return { label: 'Called Away Risk', tone: 'assignment' };
  }
  if (spot > strike && dte > 1) {
    return { label: 'Roll Viable (+Credit)', tone: 'roll-hold' };
  }
  return { label: 'Hold & Decay', tone: 'roll-hold' };
}
