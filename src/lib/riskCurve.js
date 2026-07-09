import { bsPutPrice } from './blackScholes';

/**
 * Generates the risk-curve data points for one position, ported from
 * dashboard.py's Interactive Options P/L Risk Curve Analyzer. Two lines:
 *   - "At Expiration" - the standard short-put payoff (kinked at strike)
 *   - "Theoretical Today" - current time-value-adjusted P/L, using
 *     Black-Scholes to price the put at each hypothetical spot price
 * Also returns the breakeven price (strike - premium).
 */
export function generateRiskCurve(position, points = 150) {
  const { strike: K, spot, contracts: qty, dte, iv, entry_price: prem, mid } = position;
  const sigma = iv && !Number.isNaN(iv) ? iv : 0.30;

  const sMin = Math.max(0, K * 0.85);
  const sMax = spot * 1.10;
  const step = (sMax - sMin) / (points - 1);
  const tToday = Math.max(dte || 0, 0) / 365;

  const curve = [];
  for (let i = 0; i < points; i++) {
    const S = sMin + step * i;
    const payoffExpiration = S >= K ? prem * 100 * qty : (S - K + prem) * 100 * qty;
    const putValueToday = bsPutPrice(S, K, tToday, 0.045, sigma);
    const payoffToday = (mid - putValueToday) * 100 * qty;
    curve.push({ price: Number(S.toFixed(2)), atExpiration: payoffExpiration, theoreticalToday: payoffToday });
  }

  const breakeven = K - prem;
  const maxProfit = prem * 100 * qty;

  return { curve, breakeven, maxProfit };
}