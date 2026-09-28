/**
 * lib/creditSpreadEval.js
 * ----------------------------
 * Pure calculator for docs/credit_eval.md's Credit Spread Pre-Trade
 * Evaluator - same category of tool as lib/bwbEval.js (evaluate-only, no
 * persistence, no Schwab dependency), and probability-weighted rather
 * than width-only: reuses probItmAtExpiration/RISK_FREE_RATE/DEFAULT_IV
 * from lib/blackScholes.js (already ported from dashboard.py and already
 * used by the Portfolio Overview/Position Detail pages) rather than
 * adding new probability math.
 *
 * Handles both PUT (bull put) and CALL (bear call) credit spreads via
 * `optionType`, same pattern as lib/calendarEval.js branching on
 * optionType rather than duplicating the module - added for Active
 * Spreads' chart panel, which was previously hardcoded PUT-only and
 * couldn't chart a bear call spread's strike ordering at all. Defaults
 * to 'PUT' so the standalone Credit Spread Evaluator page (still put-only
 * per docs/credit_eval.md) is unaffected.
 *
 * Net credit only (locked scope, see doc). Unlike a BWB, a valid credit
 * spread can never have zero/negative max loss - validation requires it
 * strictly positive - so there's no risk-free tier here, just
 * SUFFICIENT/INSUFFICIENT (VerdictBadge already supports both).
 */

import { probItmAtExpiration, RISK_FREE_RATE, DEFAULT_IV } from './blackScholes';

const CURVE_POINTS = 150;
const REFERENCE_ROR_THRESHOLD_PCT = 33.0; // informational "1/3 rule" comparison, not a hard gate

// PUT (bull put): short strike above long strike, payoff falls as spot drops.
// CALL (bear call): short strike below long strike, payoff falls as spot rises.
function pnlPerShareAt(optionType, spot, shortStrike, longStrike, netCreditPerShare) {
  return optionType === 'CALL'
    ? netCreditPerShare - Math.max(0, spot - shortStrike) + Math.max(0, spot - longStrike)
    : netCreditPerShare - Math.max(0, shortStrike - spot) + Math.max(0, longStrike - spot);
}

/**
 * Standalone (single-leg) max loss for a vertical spread - width between
 * strikes minus the credit collected, x100xcontracts. Split out from
 * evaluateCreditSpread() because callers that just need this number for
 * a table column (Active Spreads' Max Loss column, its Collateral
 * Allocated tile) shouldn't have to satisfy evaluateCreditSpread's
 * currentSpot/dte validation, which this figure doesn't depend on at all.
 *
 * "Standalone" matters for an iron condor's two legs specifically: each
 * leg's own number here overstates that leg's REAL risk when it's half
 * of a paired put+call spread sharing a strategy_group, since spot can
 * only land in one leg's loss zone at expiration, never both - see
 * ActiveSpreadsPage.js's combinedIronCondorMaxLoss for the corrected
 * combined figure paired legs should actually display.
 */
export function verticalSpreadMaxLoss({ shortStrike, longStrike, netCreditPerShare, contracts }) {
  const width = Math.abs((shortStrike || 0) - (longStrike || 0));
  const qty = contracts && contracts > 0 ? contracts : 1;
  const maxLossPerShare = width - (netCreditPerShare || 0);
  return { width, maxLossPerShare, totalMaxLoss: maxLossPerShare * 100 * qty };
}

/**
 * Runs validation + the structural and probability-weighted calculations
 * from docs/credit_eval.md, plus the full expiration P&L curve for
 * charting. Returns { valid: false, errors } on bad input, or
 * { valid: true, ...everything } on success.
 */
export function evaluateCreditSpread({
  shortStrike, longStrike, netCreditPerShare, contracts, currentSpot, iv, dte, optionType = 'PUT',
}) {
  const errors = [];
  const strikesValid = optionType === 'CALL' ? shortStrike < longStrike : shortStrike > longStrike;
  if (!strikesValid) {
    errors.push(optionType === 'CALL'
      ? 'Short strike must be below the long strike (bear call spread).'
      : 'Short strike must be above the long strike (put credit spread).');
  }
  const creditValid = netCreditPerShare > 0;
  if (!creditValid) errors.push('Net credit must be positive - this tool only evaluates net-credit structures.');
  const width = Math.abs(shortStrike - longStrike);
  if (strikesValid && creditValid && netCreditPerShare >= width) {
    errors.push('Net credit cannot exceed the strike width - that would imply a structurally invalid (negative) max loss for a credit spread.');
  }
  if (currentSpot === null || currentSpot === undefined) errors.push('Current spot is required - it feeds the probability calculation, not just the chart.');
  if (dte === null || dte === undefined || dte <= 0) errors.push('DTE must be a positive number of days.');

  if (errors.length > 0) return { valid: false, errors };

  const qty = contracts && contracts > 0 ? contracts : 1;
  const sigma = iv && iv > 0 ? iv : DEFAULT_IV;

  const maxProfitPerShare = netCreditPerShare;
  const maxLossPerShare = width - netCreditPerShare;

  const totalMaxProfit = maxProfitPerShare * 100 * qty;
  const totalMaxLoss = maxLossPerShare * 100 * qty;

  const returnOnRiskPct = (netCreditPerShare / maxLossPerShare) * 100;
  const rewardToRiskRatio = maxProfitPerShare / maxLossPerShare;

  const T = dte / 365.0;
  // PUT: max loss below the long strike, max profit above the short strike.
  // CALL: mirrored - max loss above the long strike, max profit below the short strike.
  const probMaxLoss = optionType === 'CALL'
    ? 1 - probItmAtExpiration(currentSpot, longStrike, T, RISK_FREE_RATE, sigma)
    : probItmAtExpiration(currentSpot, longStrike, T, RISK_FREE_RATE, sigma);
  const probMaxProfit = optionType === 'CALL'
    ? probItmAtExpiration(currentSpot, shortStrike, T, RISK_FREE_RATE, sigma)
    : 1 - probItmAtExpiration(currentSpot, shortStrike, T, RISK_FREE_RATE, sigma);
  // Everything else: spot finishes between the two strikes (partial P&L zone).
  const probPartial = 1 - probMaxLoss - probMaxProfit;

  // Linear midpoint approximation for the partial zone - not a true density
  // integral, a standard/defensible approximation given the two probability
  // points available (see doc's Non-goals - deliberate simplification).
  const partialMidValuePerShare = (maxProfitPerShare - maxLossPerShare) / 2;

  const expectedValuePerShare = (
    (probMaxProfit * maxProfitPerShare)
    + (probMaxLoss * -maxLossPerShare)
    + (probPartial * partialMidValuePerShare)
  );
  const totalExpectedValue = expectedValuePerShare * 100 * qty;

  const isPremiumSufficient = totalExpectedValue >= 0;
  const verdict = isPremiumSufficient ? 'SUFFICIENT' : 'INSUFFICIENT';

  const breakeven = optionType === 'CALL' ? shortStrike + netCreditPerShare : shortStrike - netCreditPerShare;

  const pnlAt = (spot) => pnlPerShareAt(optionType, spot, shortStrike, longStrike, netCreditPerShare) * 100 * qty;

  const lowerStrike = Math.min(shortStrike, longStrike);
  const upperStrike = Math.max(shortStrike, longStrike);
  const spotMin = lowerStrike * 0.95;
  const spotMax = upperStrike * 1.05;
  const step = (spotMax - spotMin) / (CURVE_POINTS - 1);
  const curve = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const price = spotMin + step * i;
    curve.push({ price: Number(price.toFixed(2)), pnl: Number(pnlAt(price).toFixed(2)) });
  }

  const spotPnl = Number(pnlAt(currentSpot).toFixed(2));

  return {
    valid: true, errors: [],
    optionType, shortStrike, longStrike, netCreditPerShare, contracts: qty, currentSpot, iv: sigma, dte,
    width, totalMaxProfit, totalMaxLoss, maxLossPerShare,
    returnOnRiskPct, rewardToRiskRatio, referenceRorThresholdPct: REFERENCE_ROR_THRESHOLD_PCT,
    probMaxLoss, probMaxProfit, probPartial,
    totalExpectedValue, isPremiumSufficient, verdict,
    breakeven, curve, spotPnl,
  };
}
