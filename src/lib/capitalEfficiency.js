/**
 * lib/capitalEfficiency.js
 * ----------------------------
 * Direct port of the user's own Cash-Secured Put Capital Efficiency
 * Calculator: base ROC is premium collected as a percentage of capital
 * at risk (strike); annualized ROC scales that up by the DTE window.
 * Used on the Positions page (entry_price as "premium," for an existing
 * position). The TSP Scan page already computes the identical formula
 * server-side (portfolio_service.py's monthly_yield_pct/annualized_
 * yield_pct, using mid instead of entry_price - mid IS the premium
 * you'd collect for a not-yet-entered candidate).
 */
export function computeROC(premium, strike) {
  if (!strike) return null;
  return (premium / strike) * 100;
}

export function computeAnnualizedROC(roc, dte) {
  if (roc === null || roc === undefined || !dte) return null;
  return roc * (365 / dte);
}

/**
 * Three-tier ROC classification, ported exactly from the calculator's
 * own status gate:
 *   < 12%        -> 'skip'       (premium too low relative to capital risk)
 *   12% - 25%    -> 'sweet_spot' (optimal for macro baskets/ETFs)
 *   > 25%        -> 'alpha'      (high yield spike - make sure you want to own it)
 */
export function computeROCTier(annualizedRoc) {
  if (annualizedRoc === null || annualizedRoc === undefined) return null;
  if (annualizedRoc < 12.0) return 'skip';
  if (annualizedRoc <= 25.0) return 'sweet_spot';
  return 'alpha';
}