import { probItmAtExpiration, DEFAULT_IV } from './blackScholes';

/** Downside buffer as a percentage - how far spot is above strike. */
export function computeCushionPct(spot, strike) {
  if (!spot) return 0;
  return ((spot - strike) / spot) * 100;
}

/** Risk-neutral probability of assignment at expiration, as a percentage. */
export function computeAssignmentProbPct(spot, strike, dte, iv) {
  const T = Math.max(dte || 0, 0) / 365;
  const sigma = iv && !Number.isNaN(iv) ? iv : DEFAULT_IV;
  return probItmAtExpiration(spot, strike, T, 0.045, sigma) * 100;
}

/**
 * Three-tier roll recommendation, ported exactly from dashboard.py's
 * Quick-Roll Actions Cockpit:
 *   - 'action'  (spot < strike OR assignment_prob >= 35%): defensive roll now
 *   - 'caution' (15% <= assignment_prob < 35%): monitor closely
 *   - 'safe'    (otherwise): no action needed
 * targetStrike = 5% below current strike; estimatedCredit = 45% of the
 * original entry premium - both are dashboard.py's own rule-of-thumb
 * estimates for a hypothetical roll, not a live options-chain lookup.
 */
export function computeRollRecommendation(position) {
  const { spot, strike, entry_price: entryPrice, dte, iv } = position;
  const cushion = computeCushionPct(spot, strike);
  const assignmentProb = computeAssignmentProbPct(spot, strike, dte, iv);
  const targetStrike = Math.round(strike * 0.95 * 100) / 100;
  const estimatedCredit = Math.round(entryPrice * 0.45 * 100) / 100;

  let tier;
  if (spot < strike || assignmentProb >= 35) {
    tier = 'action';
  } else if (assignmentProb >= 15) {
    tier = 'caution';
  } else {
    tier = 'safe';
  }

  return { tier, cushion, assignmentProb, targetStrike, estimatedCredit };
}

/** Assignment-risk traffic-light color, matching dashboard.py's thresholds. */
export function assignmentRiskTone(assignmentProbPct) {
  if (assignmentProbPct < 15) return 'positive';
  if (assignmentProbPct < 35) return 'warning';
  return 'negative';
}