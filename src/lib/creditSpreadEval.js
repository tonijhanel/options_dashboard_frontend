/**
 * lib/creditSpreadEval.js
 * ----------------------------
 * Pure calculator for docs/credit_eval.md's Credit Spread Pre-Trade
 * Evaluator - same category of tool as lib/bwbEval.js (evaluate-only, no
 * persistence, no Schwab dependency), but for put credit spreads, and
 * probability-weighted rather than width-only: reuses probItmAtExpiration/
 * RISK_FREE_RATE/DEFAULT_IV from lib/blackScholes.js (already ported from
 * dashboard.py and already used by the Portfolio Overview/Position
 * Detail pages) rather than adding new probability math.
 *
 * Put credit spreads, net credit only (locked scope, see doc). Unlike a
 * BWB, a valid credit spread can never have zero/negative max loss -
 * validation requires it strictly positive - so there's no risk-free tier
 * here, just SUFFICIENT/INSUFFICIENT (VerdictBadge already supports both).
 */

import { probItmAtExpiration, RISK_FREE_RATE, DEFAULT_IV } from './blackScholes';

const CURVE_POINTS = 150;
const REFERENCE_ROR_THRESHOLD_PCT = 33.0; // informational "1/3 rule" comparison, not a hard gate

function pnlPerShareAt(spot, shortStrike, longStrike, netCreditPerShare) {
  return netCreditPerShare - Math.max(0, shortStrike - spot) + Math.max(0, longStrike - spot);
}

/**
 * Runs validation + the structural and probability-weighted calculations
 * from docs/credit_eval.md, plus the full expiration P&L curve for
 * charting. Returns { valid: false, errors } on bad input, or
 * { valid: true, ...everything } on success.
 */
export function evaluateCreditSpread({ shortStrike, longStrike, netCreditPerShare, contracts, currentSpot, iv, dte }) {
  const errors = [];
  const strikesValid = shortStrike > longStrike;
  if (!strikesValid) errors.push('Short strike must be above the long strike (put credit spread).');
  const creditValid = netCreditPerShare > 0;
  if (!creditValid) errors.push('Net credit must be positive - this tool only evaluates net-credit structures.');
  if (strikesValid && creditValid && netCreditPerShare >= (shortStrike - longStrike)) {
    errors.push('Net credit cannot exceed the strike width - that would imply a structurally invalid (negative) max loss for a credit spread.');
  }
  if (currentSpot === null || currentSpot === undefined) errors.push('Current spot is required - it feeds the probability calculation, not just the chart.');
  if (dte === null || dte === undefined || dte <= 0) errors.push('DTE must be a positive number of days.');

  if (errors.length > 0) return { valid: false, errors };

  const qty = contracts && contracts > 0 ? contracts : 1;
  const sigma = iv && iv > 0 ? iv : DEFAULT_IV;

  const width = shortStrike - longStrike;
  const maxProfitPerShare = netCreditPerShare;
  const maxLossPerShare = width - netCreditPerShare;

  const totalMaxProfit = maxProfitPerShare * 100 * qty;
  const totalMaxLoss = maxLossPerShare * 100 * qty;

  const returnOnRiskPct = (netCreditPerShare / maxLossPerShare) * 100;
  const rewardToRiskRatio = maxProfitPerShare / maxLossPerShare;

  const T = dte / 365.0;
  // Probability spot finishes below the LONG strike (max loss zone) - NOT the short strike.
  const probMaxLoss = probItmAtExpiration(currentSpot, longStrike, T, RISK_FREE_RATE, sigma);
  // Probability spot finishes above the SHORT strike (max profit zone).
  const probMaxProfit = 1 - probItmAtExpiration(currentSpot, shortStrike, T, RISK_FREE_RATE, sigma);
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

  const breakeven = shortStrike - netCreditPerShare;

  const pnlAt = (spot) => pnlPerShareAt(spot, shortStrike, longStrike, netCreditPerShare) * 100 * qty;

  const spotMin = longStrike * 0.95;
  const spotMax = shortStrike * 1.05;
  const step = (spotMax - spotMin) / (CURVE_POINTS - 1);
  const curve = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const price = spotMin + step * i;
    curve.push({ price: Number(price.toFixed(2)), pnl: Number(pnlAt(price).toFixed(2)) });
  }

  const spotPnl = Number(pnlAt(currentSpot).toFixed(2));

  return {
    valid: true, errors: [],
    shortStrike, longStrike, netCreditPerShare, contracts: qty, currentSpot, iv: sigma, dte,
    width, totalMaxProfit, totalMaxLoss, maxLossPerShare,
    returnOnRiskPct, rewardToRiskRatio, referenceRorThresholdPct: REFERENCE_ROR_THRESHOLD_PCT,
    probMaxLoss, probMaxProfit, probPartial,
    totalExpectedValue, isPremiumSufficient, verdict,
    breakeven, curve, spotPnl,
  };
}
