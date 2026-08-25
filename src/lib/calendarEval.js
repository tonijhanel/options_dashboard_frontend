/**
 * lib/calendarEval.js
 * -----------------------
 * Pure calculator for docs/calendarspreads.md's risk curve - "value at
 * FRONT expiration" for a long calendar (short front-month/long
 * back-month, same strike, put or call). Unlike lib/bwbEval.js's static
 * at-expiration algebra, a calendar's payoff at front expiration still
 * depends on the back leg's remaining time value, so this needs
 * Black-Scholes (lib/blackScholes.js) rather than pure intrinsic-value
 * math - and, per the doc, a required IV-shift slider, since a calendar
 * is primarily a vega/term-structure trade and a static single-IV curve
 * misrepresents that risk.
 *
 * No backend call, no Schwab/Supabase dependency - same pattern as
 * bwbEval.js/creditSpreadEval.js.
 */

import { bsPutPrice, bsCallPrice, RISK_FREE_RATE, DEFAULT_IV } from './blackScholes';

const CURVE_POINTS = 150;
const MS_PER_DAY = 86400000;

function frontLegIntrinsic(optionType, spot, strike) {
  return optionType === 'PUT' ? Math.max(strike - spot, 0) : Math.max(spot - strike, 0);
}

function backLegValue(optionType, spot, strike, tRemainingYears, sigma) {
  return optionType === 'PUT'
    ? bsPutPrice(spot, strike, tRemainingYears, RISK_FREE_RATE, sigma)
    : bsCallPrice(spot, strike, tRemainingYears, RISK_FREE_RATE, sigma);
}

/**
 * Runs docs/calendarspreads.md's payoff_at_front_exp(S) calculation
 * across a price range, plus every input validation this tool needs
 * before charting.
 *
 * netDebitEntryPerShare: back_entry_price - front_entry_price (positive
 * for a normal long calendar, per the doc's own convention).
 * sigmaBack: the back leg's live IV (0.30 = 30%), typically from the
 * position's own current quote - falls back to DEFAULT_IV if not
 * available, with usedDefaultIv:true flagged so the UI can note it
 * (doc's own requirement, same idea as the standalone evaluators' other
 * "not live-verified" flags).
 * ivShiftPct: -20 to +20, the required IV-shift slider - shifts sigmaBack
 * by this percentage before pricing the back leg.
 *
 * Returns { valid: false, errors } on bad input, or { valid: true, ...}
 * with a `curve` array and the curve's own min/max - NOT presented as
 * algebraic max-profit/max-loss the way BWB has, since a calendar's
 * front-expiration payoff has no flat asymptote (it depends on the
 * chosen IV assumption, not fixed strike algebra).
 */
export function evaluateCalendar({
  optionType, strike, frontExpiration, backExpiration, netDebitEntryPerShare,
  contracts, currentSpot, sigmaBack, ivShiftPct,
}) {
  const errors = [];
  if (optionType !== 'PUT' && optionType !== 'CALL') errors.push('Option type must be PUT or CALL.');
  if (!(strike > 0)) errors.push('Strike must be positive.');

  const frontDate = frontExpiration ? new Date(frontExpiration) : null;
  const backDate = backExpiration ? new Date(backExpiration) : null;
  if (!frontDate || Number.isNaN(frontDate.getTime())) errors.push('Front expiration is missing or invalid.');
  if (!backDate || Number.isNaN(backDate.getTime())) errors.push('Back expiration is missing or invalid.');
  if (frontDate && backDate && !(backDate > frontDate)) {
    errors.push('Back expiration must be after front expiration.');
  }

  if (errors.length > 0) return { valid: false, errors };

  const qty = contracts && contracts > 0 ? contracts : 1;
  const tRemainingYears = (backDate - frontDate) / MS_PER_DAY / 365;

  const usedDefaultIv = sigmaBack == null || sigmaBack <= 0;
  const baseSigma = usedDefaultIv ? DEFAULT_IV : sigmaBack;
  const shiftPct = ivShiftPct || 0;
  const adjustedSigma = Math.max(baseSigma * (1 + shiftPct / 100), 0.01);

  const netDebit = netDebitEntryPerShare || 0;

  const payoffAt = (spot) => {
    const intrinsicFront = frontLegIntrinsic(optionType, spot, strike);
    const backValue = backLegValue(optionType, spot, strike, tRemainingYears, adjustedSigma);
    return (backValue - intrinsicFront - netDebit) * 100 * qty;
  };

  const spotMin = strike * 0.75;
  const spotMax = strike * 1.25;
  const step = (spotMax - spotMin) / (CURVE_POINTS - 1);
  const curve = [];
  let curveMaxProfit = -Infinity;
  let curveMaxLoss = Infinity;
  for (let i = 0; i < CURVE_POINTS; i++) {
    const price = spotMin + step * i;
    const pnl = payoffAt(price);
    curve.push({ price: Number(price.toFixed(2)), pnl: Number(pnl.toFixed(2)) });
    if (pnl > curveMaxProfit) curveMaxProfit = pnl;
    if (pnl < curveMaxLoss) curveMaxLoss = pnl;
  }

  const spotPnl = currentSpot ? Number(payoffAt(currentSpot).toFixed(2)) : null;

  return {
    valid: true, errors: [],
    optionType, strike, frontExpiration, backExpiration, netDebitEntryPerShare: netDebit,
    contracts: qty, currentSpot: currentSpot || null, spotPnl,
    tRemainingYears, sigmaBack: baseSigma, usedDefaultIv, ivShiftPct: shiftPct, adjustedSigma,
    curve, curveMaxProfit: Number(curveMaxProfit.toFixed(2)), curveMaxLoss: Number(curveMaxLoss.toFixed(2)),
  };
}

/**
 * Linear-interpolated pnl at an arbitrary price along a curve array -
 * shared by combineCurves (resampling two curves onto one grid) and by
 * callers that need a combined curve's value at the current spot (e.g.
 * the chart's ReferenceDot), which isn't necessarily one of the curve's
 * own discrete points.
 */
export function curveValueAt(curve, price) {
  if (!curve?.length) return null;
  if (price <= curve[0].price) return curve[0].pnl;
  if (price >= curve[curve.length - 1].price) return curve[curve.length - 1].pnl;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (price >= a.price && price <= b.price) {
      const t = (price - a.price) / (b.price - a.price);
      return a.pnl + t * (b.pnl - a.pnl);
    }
  }
  return curve[curve.length - 1].pnl;
}

/**
 * Sums two curves point-by-point over a SHARED price range (docs/
 * calendarspreads.md's "combined double calendar view") - each curve was
 * computed independently around its own strike, so their price grids
 * rarely line up exactly; this resamples both onto one shared grid via
 * linear interpolation before summing, rather than assuming matching
 * points.
 */
export function combineCurves(curveA, curveB) {
  if (!curveA?.length || !curveB?.length) return [];

  const min = Math.min(curveA[0].price, curveB[0].price);
  const max = Math.max(curveA[curveA.length - 1].price, curveB[curveB.length - 1].price);
  const step = (max - min) / (CURVE_POINTS - 1);

  const combined = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const price = min + step * i;
    const pnl = curveValueAt(curveA, price) + curveValueAt(curveB, price);
    combined.push({ price: Number(price.toFixed(2)), pnl: Number(pnl.toFixed(2)) });
  }
  return combined;
}
