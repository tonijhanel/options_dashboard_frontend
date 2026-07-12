/**
 * lib/formatDate.js
 * -------------------
 * Every date this app stores (entry_date, closed_date, etc.) represents
 * a CALENDAR DAY, saved as midnight UTC (e.g. "2025-08-01T00:00:00+00:00").
 * Formatting that with plain `new Date(x).toLocaleDateString()` uses the
 * BROWSER'S local timezone, which for anyone west of UTC shifts midnight
 * back into the previous day - e.g. a real entry_date of 2025-08-01
 * displaying as 7/31/2025 for a US-based viewer. Forcing the UTC
 * timezone here keeps the displayed date matching the stored date
 * exactly, regardless of where the viewer actually is.
 */
export function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString(undefined, { timeZone: 'UTC' });
}