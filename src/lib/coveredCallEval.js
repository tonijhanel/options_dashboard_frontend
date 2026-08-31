/**
 * lib/coveredCallEval.js
 * -------------------------
 * Pure calculator for a covered call's expiration payoff curve - long
 * shares + short call, same "no backend call, no Schwab/Supabase
 * dependency" pattern as lib/bwbEval.js. Simpler payoff shape than a
 * BWB or calendar: capped upside above the call strike (shares get
 * called away there), linear downside below the breakeven (the call
 * premium only cushions the stock's cost basis, it doesn't cap loss).
 */

const CURVE_POINTS = 150;

function pnlPerShareAt(spot, strike, shareCostBasis, entryPricePerShare) {
  return Math.min(spot, strike) - shareCostBasis + entryPricePerShare;
}

/**
 * Returns { valid: false, errors } on bad input, or { valid: true, ...everything }
 * including the full expiration P&L curve for charting.
 */
export function evaluateCoveredCall({ strike, shareCostBasis, entryPricePerShare, shareQuantity, currentSpot }) {
  const errors = [];
  if (!(strike > 0)) errors.push('Strike must be positive.');
  if (!(shareCostBasis > 0)) errors.push('Share cost basis must be positive.');
  if (!(shareQuantity > 0)) errors.push('Share quantity must be positive.');
  if (!(entryPricePerShare >= 0)) errors.push('Entry premium cannot be negative.');

  if (errors.length > 0) return { valid: false, errors };

  const breakeven = shareCostBasis - entryPricePerShare;
  const maxProfitPerShare = strike - shareCostBasis + entryPricePerShare;
  const maxProfit = maxProfitPerShare * shareQuantity;

  const pnlAt = (spot) => pnlPerShareAt(spot, strike, shareCostBasis, entryPricePerShare) * shareQuantity;

  const spotMin = shareCostBasis * 0.7;
  const spotMax = strike * 1.15;
  const step = (spotMax - spotMin) / (CURVE_POINTS - 1);
  const curve = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const price = spotMin + step * i;
    curve.push({ price: Number(price.toFixed(2)), pnl: Number(pnlAt(price).toFixed(2)) });
  }

  const spotPnl = currentSpot ? Number(pnlAt(currentSpot).toFixed(2)) : null;

  return {
    valid: true, errors: [],
    strike, shareCostBasis, entryPricePerShare, shareQuantity, currentSpot: currentSpot || null,
    breakeven, maxProfitPerShare, maxProfit,
    curve, spotPnl,
  };
}
