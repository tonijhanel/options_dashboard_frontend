/**
 * lib/profitCaptured.js
 * -------------------------
 * "% of max profit captured" for a defined-risk spread (vertical or BWB) -
 * the spread-page equivalent of PositionsPage's naked-put take-profit
 * slider (lib/positionSignal.js), but simpler: no assignment/roll tiers,
 * since a defined-risk structure doesn't carry a naked put's single-strike
 * assignment risk in the same way. Just a percentage against the same
 * ProfitTargetSlider used on the CSP page.
 */

/**
 * livePnl and maxProfitDollars are both already-signed dollar amounts
 * (ActiveSpreadsPage/BwbTradesPage's own live_pnl/max_profit fields, or
 * net_entry*100*contracts for a vertical, which has no separate
 * max_profit field of its own - a credit vertical's max profit IS the
 * entry credit, realized when current_net_value decays to 0).
 *
 * Returns a percentage (e.g. 62.4, meaning 62.4%), or null if either
 * input is missing or maxProfitDollars isn't a real positive max profit
 * (e.g. a debit spread, or a row missing per-leg entry data).
 */
export function pctOfMaxProfitCaptured(livePnl, maxProfitDollars) {
  if (livePnl == null || maxProfitDollars == null || maxProfitDollars <= 0) return null;
  return (livePnl / maxProfitDollars) * 100;
}
