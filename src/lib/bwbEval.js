/**
 * lib/bwbEval.js
 * -------------------
 * Pure calculator for docs/bwb_eval.md's BWB Pre-Trade Evaluator - a
 * standalone, chain-free "does this proposed Put Broken Wing Butterfly
 * have enough premium to be worth entering" check, ported from Toni's
 * notebook (calculate_max_profit / generate_bwb_chart), same pattern as
 * lib/riskCurve.js (itself ported from dashboard.py's Risk Curve
 * Analyzer) - no backend call, no Schwab/Supabase dependency.
 *
 * Net-credit put BWBs only (locked scope, see doc) - naming mirrors the
 * shipped BWB entry page (BwbTradesPage.js's longLowStrike/shortMidStrike/
 * longHighStrike), not the doc's own strike_low/mid/high wording.
 */

const CURVE_POINTS = 150;

/**
 * max_loss_per_share = max(embedded_risk_gap, 0) - net_credit_per_share
 * (docs/bwb_eval.md's Calculations section) - the general form, algebraically
 * equivalent in every case to the already-locked production formula
 * `net_cost - min(W_upper - W_lower, 0)` used elsewhere in the dashboard
 * (net_cost = -net_credit_per_share, W_upper/W_lower = upside/downside wing
 * width). The naive `embedded_risk_gap - net_credit` shortcut only holds
 * when the downside wing is wider - flooring at 0 handles the inverted case
 * (upside wing wider) too, where the worst point on the curve is actually
 * the flat region above the high strike, not below the low strike.
 */
function pnlPerShareAt(spot, longLowStrike, shortMidStrike, longHighStrike, netCreditPerShare) {
  return (
    Math.max(0, longHighStrike - spot)
    - 2 * Math.max(0, shortMidStrike - spot)
    + Math.max(0, longLowStrike - spot)
    + netCreditPerShare
  );
}

/**
 * Runs validation + every calculation in docs/bwb_eval.md's Calculations
 * section, plus the full expiration P&L curve for charting.
 *
 * Returns { valid: false, errors } on bad input (strikes out of order, or
 * non-positive credit - this tool only evaluates net-credit structures),
 * or { valid: true, ...everything } on success.
 */
export function evaluateBwb({ longLowStrike, shortMidStrike, longHighStrike, netCreditPerShare, contracts, currentSpot }) {
  const errors = [];
  if (!(longLowStrike < shortMidStrike)) errors.push('Low strike must be below the short (middle) strike.');
  if (!(shortMidStrike < longHighStrike)) errors.push('Short (middle) strike must be below the high strike.');
  if (!(netCreditPerShare > 0)) errors.push('Net credit must be positive - this tool only evaluates net-credit structures, not debit BWBs.');

  if (errors.length > 0) return { valid: false, errors };

  const qty = contracts && contracts > 0 ? contracts : 1;

  const upsideWingWidth = longHighStrike - shortMidStrike;
  const downsideWingWidth = shortMidStrike - longLowStrike;
  const embeddedRiskGap = downsideWingWidth - upsideWingWidth;

  const totalMaxProfit = (upsideWingWidth + netCreditPerShare) * 100 * qty;
  const maxLossPerShare = Math.max(embeddedRiskGap, 0) - netCreditPerShare;
  const totalMaxLoss = maxLossPerShare * 100 * qty;
  const isRiskFree = totalMaxLoss <= 0;

  // Breakeven/reward-to-risk are only meaningful when the trade actually
  // has downside risk - undefined/misleading otherwise (doc's Risk-free
  // case handling section).
  const downsideBreakeven = isRiskFree ? null : longLowStrike + maxLossPerShare;
  const rewardToRiskRatio = isRiskFree ? null : totalMaxProfit / totalMaxLoss;
  const isPremiumSufficient = isRiskFree ? null : totalMaxProfit >= totalMaxLoss;
  const guaranteedProfit = isRiskFree ? -totalMaxLoss : null;

  const verdict = isRiskFree ? 'RISK_FREE' : (isPremiumSufficient ? 'SUFFICIENT' : 'INSUFFICIENT');

  const pnlAt = (spot) => pnlPerShareAt(spot, longLowStrike, shortMidStrike, longHighStrike, netCreditPerShare) * 100 * qty;

  const spotMin = longLowStrike * 0.95;
  const spotMax = longHighStrike * 1.05;
  const step = (spotMax - spotMin) / (CURVE_POINTS - 1);
  const curve = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const price = spotMin + step * i;
    curve.push({ price: Number(price.toFixed(2)), pnl: Number(pnlAt(price).toFixed(2)) });
  }

  const spotPnl = currentSpot ? Number(pnlAt(currentSpot).toFixed(2)) : null;

  return {
    valid: true, errors: [],
    longLowStrike, shortMidStrike, longHighStrike, netCreditPerShare, contracts: qty, currentSpot: currentSpot || null,
    upsideWingWidth, downsideWingWidth, embeddedRiskGap,
    totalMaxProfit, totalMaxLoss, maxLossPerShare, guaranteedProfit,
    downsideBreakeven, rewardToRiskRatio, isPremiumSufficient, isRiskFree, verdict,
    curve, spotPnl,
  };
}
