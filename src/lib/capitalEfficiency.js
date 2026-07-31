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
 * Three-tier ROC classification - thresholds depend on the ticker's
 * registry group, since a "good" annualized ROC on a single stock and on
 * an ETF/macro basket are not the same number:
 *
 *   Group A (single stocks / high beta):
 *     < 12%        -> 'skip'       (premium too low relative to capital risk)
 *     12% - 25%    -> 'sweet_spot'
 *     > 25%        -> 'alpha'      (high yield spike - make sure you want to own it)
 *
 *   Group B (ETFs / macro baskets):
 *     < 8.5%        -> 'skip'
 *     8.5% - 15%    -> 'sweet_spot'
 *     > 15%         -> 'alpha'     (rare for an ETF - signals a massive, highly
 *                                   profitable panic, not routine premium)
 *
 * group: 'A' | 'B' | null/undefined - anything other than exactly 'B'
 * (including missing/unset) falls back to Group A's thresholds, the more
 * conservative (higher-bar) assumption for a ticker this app doesn't have
 * classified.
 */
const ROC_TIER_THRESHOLDS = {
  A: { skip: 12.0, alpha: 25.0 },
  B: { skip: 8.5, alpha: 15.0 },
};

export function computeROCTier(annualizedRoc, group) {
  if (annualizedRoc === null || annualizedRoc === undefined) return null;
  const { skip, alpha } = group === 'B' ? ROC_TIER_THRESHOLDS.B : ROC_TIER_THRESHOLDS.A;
  if (annualizedRoc < skip) return 'skip';
  if (annualizedRoc <= alpha) return 'sweet_spot';
  return 'alpha';
}