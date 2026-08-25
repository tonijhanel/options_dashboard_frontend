/**
 * lib/blackScholes.js
 * -----------------------
 * Direct JS port of dashboard.py's Black-Scholes helpers. Used by the
 * Portfolio Overview page (assignment probability, downside cushions)
 * and the Position Detail page (the "Theoretical P/L Today" risk-curve
 * line). Ported exactly, not reimplemented from scratch - cross-checked
 * against the original Python function for the same inputs before
 * trusting it (see the numbers this was verified against in the
 * conversation this was built in).
 */

const RISK_FREE_RATE = 0.045; // matches dashboard.py's rough T-bill proxy
const DEFAULT_IV = 0.30; // matches dashboard.py's DEFAULT_IV fallback

// erf() isn't a built-in JS Math function (unlike Python's math.erf) -
// this is the standard Abramowitz & Stegun 7.1.26 approximation, accurate
// to ~1.5e-7, which is what most language runtimes use internally anyway.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/** Black-Scholes price of a European put. T in years. */
export function bsPutPrice(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return Math.max(K - S, 0);
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/**
 * Black-Scholes price of a European call. T in years. Same d1/d2 as
 * bsPutPrice (put-call parity), added for the Calendar Spread evaluator
 * (lib/calendarEval.js) - calendars can be either puts or calls, unlike
 * the naked-put/BWB/credit-spread evaluators this file previously only
 * needed to support.
 */
export function bsCallPrice(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return Math.max(S - K, 0);
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

/** Risk-neutral probability a put finishes in-the-money (assignment risk). */
export function probItmAtExpiration(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return S < K ? 1.0 : 0.0;
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return normCdf(-d2);
}

/**
 * Risk-neutral probability the terminal price lands strictly between
 * `low` and `high` at time T - the same lognormal machinery as
 * probItmAtExpiration (P(S_T < X) = normCdf(-d2(X))), just evaluated at
 * two thresholds and subtracted, rather than one. Added for the Calendar
 * Spread chart's "probability of max profit" (a narrow band around the
 * strike) and "probability of any profit" (between the two breakevens)
 * stats - lib/calendarEval.js.
 */
export function probBetween(S, low, high, T, r, sigma) {
  if (low >= high) return 0;
  if (T <= 0 || sigma <= 0 || S <= 0) {
    return (S >= low && S <= high) ? 1.0 : 0.0;
  }
  const d2 = (X) => {
    const d1 = (Math.log(S / X) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
    return d1 - sigma * Math.sqrt(T);
  };
  // P(S_T < high) - P(S_T < low)
  return Math.max(normCdf(-d2(high)) - normCdf(-d2(low)), 0);
}

export { RISK_FREE_RATE, DEFAULT_IV };