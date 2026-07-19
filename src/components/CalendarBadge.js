import { useState } from 'react';
import { formatDate } from '../lib/formatDate';
import styles from './CalendarBadge.module.css';

// Per docs/dividends.md: flat N-days-from-today window, same for both
// event types - not tied to a position's DTE.
const WARNING_WINDOW_DAYS = 14;

function isWithinWarningWindow(dateString) {
  if (!dateString) return false;
  const target = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - todayUTC) / 86400000);
  return diffDays >= 0 && diffDays <= WARNING_WINDOW_DAYS;
}

// Styled hover popup (same pattern as NewsPreview's tooltip) - replaces a
// plain native `title` attribute, which is easy to miss and can't be styled.
function BadgeIcon({ tone, letter, label, date }) {
  const [hovering, setHovering] = useState(false);

  return (
    <span
      className={styles.iconWrap}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <span className={`${styles.icon} ${styles[tone]}`}>{letter}</span>
      {hovering && (
        <div className={styles.tooltip}>
          {label}: <strong>{formatDate(date)}</strong>
        </div>
      )}
    </span>
  );
}

/**
 * Shared earnings/ex-dividend warning icon - one component dropped into
 * every place a ticker is rendered (Positions, TSP Scan, CSP Scan, Ticker
 * Registry), per docs/dividends.md, rather than four separate
 * implementations.
 */
export default function CalendarBadge({ nextEarningsDate, nextExDividendDate }) {
  const showEarnings = isWithinWarningWindow(nextEarningsDate);
  const showDividend = isWithinWarningWindow(nextExDividendDate);

  if (!showEarnings && !showDividend) return null;

  return (
    <span className={styles.wrap}>
      {showEarnings && <BadgeIcon tone="earnings" letter="E" label="Earnings" date={nextEarningsDate} />}
      {showDividend && <BadgeIcon tone="dividend" letter="D" label="Ex-Dividend" date={nextExDividendDate} />}
    </span>
  );
}
