import { computeCushionPct, computeAssignmentProbPct } from './positionRisk';

/**
 * Generates one narrated insight per position, in the exact tier order
 * dashboard.py used (checked top to bottom, first match wins):
 *   1. assignment_prob > 35%  -> red, "consider rolling or closing"
 *   2. cushion > 10%          -> green, "highly secure zone"
 *   3. cushion < 5%           -> warning, "approaching your strike"
 *   4. otherwise              -> info, "behaving exactly as expected"
 */
export function generatePortfolioInsights(positions) {
  return positions.map((p) => {
    const cushion = computeCushionPct(p.spot, p.strike);
    const assignmentProb = computeAssignmentProbPct(p.spot, p.strike, p.dte, p.iv);

    if (assignmentProb > 35.0) {
      return {
        ticker: p.ticker,
        tone: 'negative',
        text: `${p.ticker} has a ${assignmentProb.toFixed(1)}% probability of assignment at expiration. Consider rolling or closing.`,
      };
    }
    if (cushion > 10.0) {
      return {
        ticker: p.ticker,
        tone: 'positive',
        text: `${p.ticker} is in a highly secure zone with a massive ${cushion.toFixed(1)}% downside buffer (${assignmentProb.toFixed(1)}% assignment risk).`,
      };
    }
    if (cushion < 5.0) {
      return {
        ticker: p.ticker,
        tone: 'warning',
        text: `${p.ticker} is approaching your strike. Downside buffer is currently only ${cushion.toFixed(1)}% (${assignmentProb.toFixed(1)}% assignment risk). Review support levels.`,
      };
    }
    return {
      ticker: p.ticker,
      tone: 'info',
      text: `${p.ticker} is behaving exactly as expected with a solid ${cushion.toFixed(1)}% downside buffer (${assignmentProb.toFixed(1)}% assignment risk).`,
    };
  });
}