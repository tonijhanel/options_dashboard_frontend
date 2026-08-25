/**
 * lib/dte.js
 * -------------
 * Days to expiration, purely from today's calendar date to an
 * expiration date string - no floor/clamp (0 on expiration day itself,
 * negative if somehow overdue) since this is for a DISPLAY column, not
 * evaluator math (contrast ActiveSpreadsPage's own local daysToExpiration,
 * which floors at 1 specifically because the P&L evaluator needs a
 * non-zero dte to run its probability calc - a different need, kept
 * separate rather than reusing this).
 */
export function computeDTE(expirationDate) {
  if (!expirationDate) return null;
  const msPerDay = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / msPerDay);
}
