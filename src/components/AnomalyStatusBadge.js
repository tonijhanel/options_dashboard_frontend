import { useState, useEffect, useRef, useCallback } from 'react';
import { getDataAnomalies } from '../api/client';
import styles from './AnomalyStatusBadge.module.css';

// Same idea as the existing _missing_fields/_errors soft-failure pattern
// used throughout this codebase (build_tsp_portfolio_snapshot's `errors`
// dict, get_live_positions' `_position_log_error`) - surfaces something
// worth a look without blocking or warning about nothing when everything's
// clean. See docs/quantfeatures.md Feature 1.
const SEVERITY_RANK = { critical: 2, warning: 1, info: 0 };
const SEVERITY_LABEL = { critical: 'Critical', warning: 'Warning', info: 'Info' };

function timeAgo(isoString) {
  if (!isoString) return null;
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AnomalyStatusBadge() {
  const [anomalies, setAnomalies] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await getDataAnomalies();
      setAnomalies(result.results || []);
    } catch {
      setAnomalies(null);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!anomalies) return null;
  const unresolved = anomalies
    .filter((a) => !a.resolved)
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? -1) - (SEVERITY_RANK[a.severity] ?? -1));

  // Nothing wrong - don't clutter the nav with a permanent "all clear" widget.
  if (unresolved.length === 0) return null;

  const highestSeverity = unresolved[0].severity;
  const tone = highestSeverity === 'critical' ? 'negative' : highestSeverity === 'warning' ? 'warning' : 'neutral';

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={`${styles.trigger} ${styles[tone]}`} onClick={() => setOpen((o) => !o)}>
        <span className={styles.dot} />
        {unresolved.length} data anomal{unresolved.length === 1 ? 'y' : 'ies'}
      </button>

      {open && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Data Anomalies</h3>
          <p className={styles.panelText}>
            Contracts or positions flagged as implausible or internally inconsistent when they came in from
            Schwab/SnapTrade - critical ones are excluded from portfolio totals but still shown here.
          </p>
          <ul className={styles.list}>
            {unresolved.map((a) => (
              <li key={a.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={`${styles.severityBadge} ${styles[a.severity] || styles.neutral}`}>
                    {SEVERITY_LABEL[a.severity] || a.severity}
                  </span>
                  {a.ticker && <span className={styles.ticker}>{a.ticker}</span>}
                  <span className={styles.timestamp}>{timeAgo(a.detected_at)}</span>
                </div>
                <div className={styles.message}>{a.message}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
