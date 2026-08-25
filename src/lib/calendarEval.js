/**
 * lib/calendarEval.js
 * -----------------------
 * Pure calculator for docs/calendarchart.md's dual-curve calendar chart
 * (a long calendar: short front-month/long back-month, same strike, put
 * or call) - an "expiry" curve (value at front expiration, short leg at
 * pure intrinsic value) and a "current" curve (theoretical value TODAY,
 * both legs still alive and priced with Black-Scholes). Unlike lib/
 * bwbEval.js's static at-expiration algebra, a calendar's payoff depends
 * on the back leg's remaining time value even at front expiration, so
 * this needs Black-Scholes (lib/blackScholes.js) throughout - and, per
 * the spec, a required IV-shift slider, since a calendar is primarily a
 * vega/term-structure trade and a static single-IV curve misrepresents
 * that risk. The shift only ever applies to the BACK leg's sigma, never
 * the front leg's - matching the slider's own label ("Back-leg IV shift
 * at front expiration").
 *
 * No backend call, no Schwab/Supabase dependency - same pattern as
 * bwbEval.js/creditSpreadEval.js. Client-side by explicit choice (same
 * decision as the original risk-curve build), not the backend
 * `indicators/` module docs/calendarchart.md's wording gestures at.
 */

import { bsPutPrice, bsCallPrice, probBetween, RISK_FREE_RATE, DEFAULT_IV } from './blackScholes';

const CURVE_POINTS = 150;
const MS_PER_DAY = 86400000;
const MAX_PROFIT_BAND_PCT = 0.025; // ±2.5% of strike, per docs/calendarchart.md

function intrinsic(optionType, spot, strike) {
  return optionType === 'PUT' ? Math.max(strike - spot, 0) : Math.max(spot - strike, 0);
}

// Black-Scholes value of EITHER leg - both legs are the same option_type
// (a calendar's two legs only ever differ by expiration, never by
// put/call), so one pricer covers front-today, back-today, and
// back-at-front-expiration alike; only T/sigma differ per call site.
function legValue(optionType, spot, strike, tYears, sigma) {
  return optionType === 'PUT'
    ? bsPutPrice(spot, strike, tYears, RISK_FREE_RATE, sigma)
    : bsCallPrice(spot, strike, tYears, RISK_FREE_RATE, sigma);
}

// Zero-crossing breakevens on a curve - linear interpolation between the
// two sampled points straddling each sign change. "Estimate" throughout
// this module (docs/calendarchart.md's own "(est)" framing) since a
// calendar's front-expiration payoff has no flat asymptote/closed-form
// breakeven the way BWB/vertical spreads have - it depends on the chosen
// IV assumption, not fixed strike algebra.
function findBreakevens(curve, key) {
  const breakevens = [];
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i][key], b = curve[i + 1][key];
    if (a === 0) {
      breakevens.push(curve[i].price);
    } else if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const t = -a / (b - a);
      breakevens.push(Number((curve[i].price + t * (curve[i + 1].price - curve[i].price)).toFixed(2)));
    }
  }
  return breakevens;
}

/**
 * Runs docs/calendarchart.md's full calculation: both the expiry curve
 * and the current/today curve across a shared price range, breakevens,
 * max profit/loss (est), risk/reward, and the two probability stats.
 *
 * (2026-08: this used to also expose the raw front/back leg values at
 * front expiration for a "Show legs" debug overlay - it did its job,
 * isolating the IV-units bug fixed in chain_service.get_quote_for_strike,
 * and was removed afterward. The leg values live on a completely
 * different dollar scale than the combined P&L, which squashed the main
 * curve flat near zero on a shared y-axis - not worth a second y-axis
 * for a debug-only view now that the bug it existed to catch is fixed.)
 *
 * sigmaFront/sigmaBack: each leg's own live IV (0.30 = 30%), typically
 * from the position's own current quote (`front_iv`/`back_iv`, already
 * returned by GET /active-calendars) - each independently falls back to
 * DEFAULT_IV if unavailable, flagged via usedDefaultFrontIv/
 * usedDefaultBackIv so the UI can note it per-leg.
 *
 * ivShiftPct: -20 to +20, the required IV-shift slider - shifts ONLY
 * sigmaBack (never sigmaFront) by this percentage, applied to every
 * back-leg pricing call in both curves and the debug overlay.
 *
 * probMaxProfitPct: probability (0-100) the spot lands within ±2.5% of
 * strike at front expiration, using front-leg IV/T_front_remaining -
 * "max profit" is a single point on a continuous distribution (zero
 * probability), so this is a narrow-band proxy for "landed near it,"
 * per docs/calendarchart.md.
 * probAnyProfitPct: probability (0-100) spot lands between the two
 * breakevens at front expiration - ONLY computed when the curve
 * produces EXACTLY two breakevens (the normal calendar tent shape);
 * null otherwise, with breakevenCount reported so the caller can show
 * why, rather than guessing at one-sided logic for an atypical curve.
 *
 * Returns { valid: false, errors } on bad input, or { valid: true, ... }.
 */
export function evaluateCalendar({
  optionType, strike, frontExpiration, backExpiration, netDebitEntryPerShare,
  contracts, currentSpot, sigmaFront, sigmaBack, ivShiftPct,
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
  const netDebit = netDebitEntryPerShare || 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tRemainingAtFrontExpYears = (backDate - frontDate) / MS_PER_DAY / 365;
  const tFrontRemainingYears = Math.max((frontDate - today) / MS_PER_DAY, 0) / 365;
  const tBackRemainingYears = Math.max((backDate - today) / MS_PER_DAY, 0) / 365;

  const usedDefaultFrontIv = sigmaFront == null || sigmaFront <= 0;
  const baseSigmaFront = usedDefaultFrontIv ? DEFAULT_IV : sigmaFront;
  const usedDefaultBackIv = sigmaBack == null || sigmaBack <= 0;
  const baseSigmaBack = usedDefaultBackIv ? DEFAULT_IV : sigmaBack;
  const shiftPct = ivShiftPct || 0;
  const adjustedSigmaBack = Math.max(baseSigmaBack * (1 + shiftPct / 100), 0.01);

  const expiryPnlAt = (spot) => {
    const backValue = legValue(optionType, spot, strike, tRemainingAtFrontExpYears, adjustedSigmaBack);
    return (backValue - intrinsic(optionType, spot, strike) - netDebit) * 100 * qty;
  };
  const currentPnlAt = (spot) => {
    const shortValue = legValue(optionType, spot, strike, tFrontRemainingYears, baseSigmaFront);
    const longValue = legValue(optionType, spot, strike, tBackRemainingYears, adjustedSigmaBack);
    return (longValue - shortValue - netDebit) * 100 * qty;
  };

  const spotMin = strike * 0.75;
  const spotMax = strike * 1.25;
  const step = (spotMax - spotMin) / (CURVE_POINTS - 1);
  const curve = [];
  let maxProfitEst = -Infinity;
  let worstPnl = Infinity;
  for (let i = 0; i < CURVE_POINTS; i++) {
    const price = spotMin + step * i;
    const expiryPnl = expiryPnlAt(price);
    const currentPnl = currentPnlAt(price);

    curve.push({
      price: Number(price.toFixed(2)),
      // Kept as `pnl` (not `expiryPnl`) for backward compatibility with
      // curveValueAt/combineCurves, which only ever operated on the
      // expiry curve for the double-calendar combined view.
      pnl: Number(expiryPnl.toFixed(2)),
      currentPnl: Number(currentPnl.toFixed(2)),
    });
    if (expiryPnl > maxProfitEst) maxProfitEst = expiryPnl;
    if (expiryPnl < worstPnl) worstPnl = expiryPnl;
  }

  const breakevens = findBreakevens(curve, 'pnl');
  const breakevenCount = breakevens.length;

  const maxLossEst = Math.abs(worstPnl);
  const riskReward = maxLossEst > 0 ? Number((maxProfitEst / maxLossEst).toFixed(3)) : null;

  const bandLow = strike * (1 - MAX_PROFIT_BAND_PCT);
  const bandHigh = strike * (1 + MAX_PROFIT_BAND_PCT);
  const probMaxProfitPct = currentSpot
    ? Number((probBetween(currentSpot, bandLow, bandHigh, tFrontRemainingYears, RISK_FREE_RATE, baseSigmaFront) * 100).toFixed(2))
    : null;
  const probAnyProfitPct = (currentSpot && breakevenCount === 2)
    ? Number((probBetween(currentSpot, breakevens[0], breakevens[1], tFrontRemainingYears, RISK_FREE_RATE, baseSigmaFront) * 100).toFixed(2))
    : null;

  return {
    valid: true, errors: [],
    optionType, strike, frontExpiration, backExpiration, netDebitEntryPerShare: netDebit,
    contracts: qty, currentSpot: currentSpot || null,
    spotPnl: currentSpot ? Number(expiryPnlAt(currentSpot).toFixed(2)) : null,
    spotPnlToday: currentSpot ? Number(currentPnlAt(currentSpot).toFixed(2)) : null,
    tFrontRemainingYears, tBackRemainingYears, tRemainingAtFrontExpYears,
    sigmaFront: baseSigmaFront, usedDefaultFrontIv,
    sigmaBack: baseSigmaBack, usedDefaultBackIv, ivShiftPct: shiftPct, adjustedSigmaBack,
    curve,
    maxProfitEst: Number(maxProfitEst.toFixed(2)),
    maxLossEst: Number(maxLossEst.toFixed(2)),
    riskReward,
    breakevens, breakevenCount,
    probMaxProfitPct, probAnyProfitPct,
  };
}

/**
 * Linear-interpolated pnl (expiry curve) at an arbitrary price along a
 * curve array - shared by combineCurves (resampling two curves onto one
 * grid) and by callers that need a combined curve's value at the
 * current spot (e.g. the chart's ReferenceDot), which isn't necessarily
 * one of the curve's own discrete points.
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
 * Sums two curves' EXPIRY pnl point-by-point over a SHARED price range
 * (docs/calendarspreads.md's "combined double calendar view") - each
 * curve was computed independently around its own strike, so their
 * price grids rarely line up exactly; this resamples both onto one
 * shared grid via linear interpolation before summing, rather than
 * assuming matching points. Expiry-only (not extended to the current
 * curve) - the combined view's own spec never asked for a "today" line.
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
