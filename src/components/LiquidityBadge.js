import styles from './LiquidityBadge.module.css';

const SEVERITY_LABELS = {
  ok: 'OK',
  warning: 'THINNING',
  critical: 'ILLIQUID',
};

function pct(value) {
  return value === null || value === undefined ? null : `${(value * 100).toFixed(0)}%`;
}

// snapshot: a row from GET /liquidity-status (or undefined/null if this
// position has no snapshot yet - no baseline captured, or the daily job
// hasn't run since it opened). Matches the existing soft-fail convention
// (CalendarBadge, AnomalyStatusBadge) of just showing nothing rather than
// a placeholder when there's no data to show.
export default function LiquidityBadge({ snapshot }) {
  if (!snapshot) return <span className={styles.none}>—</span>;

  const oiDecay = pct(snapshot.oi_decay_pct);
  const spreadWidening = pct(snapshot.spread_widening_pct);
  const title = [
    oiDecay !== null ? `OI down ${oiDecay} from entry (${snapshot.open_interest ?? '—'} now)` : null,
    spreadWidening !== null ? `Spread widened ${spreadWidening} from entry (${snapshot.bid_ask_spread_pct ?? '—'}% now)` : null,
    snapshot.snapshot_date ? `As of ${snapshot.snapshot_date}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <span className={`${styles.badge} ${styles[snapshot.severity] || styles.ok}`} title={title}>
      {SEVERITY_LABELS[snapshot.severity] || snapshot.severity}
    </span>
  );
}
