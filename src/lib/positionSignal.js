/**
 * lib/positionSignal.js
 * -------------------------
 * Direct JS port of backend/services/position_signal.py's compute_status().
 * Deliberately NOT part of the API response - the backend was designed to
 * return raw position facts only, since the take-profit threshold is a
 * user preference, not a fact about the position. This is where that
 * preference actually gets applied, driven by the profit-target slider
 * on the Positions page.
 *
 * Keep this in exact sync with position_signal.py if that file ever
 * changes - the whole point of solidifying that logic backend-side was
 * to have ONE definition of the status rule; this port just moves where
 * it executes, not what it means.
 */

// entryPrice: pass an EFFECTIVE entry price for a rolled position -
// PositionsPage.js's own positionsWithStatus already does this
// (entry_price + carried_pnl / (contracts * 100), see its comment) before
// calling this function - kept out of this function itself so it stays
// the same pure calculation position_signal.py's compute_status is.
export function computeStatus(entryPrice, currentMid, spot, strike, dte, profitTargetPct = 80) {
  const ptScalar = profitTargetPct / 100;
  const dynamicTargetBuyback = entryPrice * (1 - ptScalar);

  if (currentMid <= dynamicTargetBuyback) {
    return { label: `Take Profit (${Math.round(profitTargetPct)}%)`, tone: 'take-profit' };
  }
  if (dte <= 1 && spot < strike) {
    return { label: 'Prepare Assignment', tone: 'assignment' };
  }
  if (spot < strike && dte > 1) {
    return { label: 'Roll Viable (+Credit)', tone: 'roll-hold' };
  }
  return { label: 'Hold & Decay', tone: 'roll-hold' };
}
