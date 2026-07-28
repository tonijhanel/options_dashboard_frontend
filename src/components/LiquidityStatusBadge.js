import { useState, useEffect, useRef, useCallback } from 'react';
import { getLiquidityStatus } from '../api/client';
import styles from './LiquidityStatusBadge.module.css';

// Global nav pill (docs/liquiddecay.md's Integration Points - "next to
// the existing data anomalies and Schwab token pills") - same
// poll-and-dropdown pattern as AnomalyStatusBadge, reading the same
// GET /liquidity-status every page already uses for its own Liquidity
// column. Doesn't enumerate individual flagged positions here (a
// liquidity_snapshots row only carries position_id/strategy_group, not a
// ticker - resolving that would need a join this component doesn't have)
// - detail lives on the flagged row itself (Position Log, CSP Positions,
// Active Spreads, BWB Trades), matching the doc's own "row detail, not
// global panel" call.
export default function LiquidityStatusBadge() {
  const [snapshots, setSnapshots] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await getLiquidityStatus();
      setSnapshots(result.results || []);
    } catch {
      setSnapshots(null);
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

  if (!snapshots) return null;
  const flagged = snapshots.filter((s) => s.severity && s.severity !== 'ok');

  // Nothing wrong - don't clutter the nav with a permanent "all clear" widget.
  if (flagged.length === 0) return null;

  const criticalCount = flagged.filter((s) => s.severity === 'critical').length;
  const warningCount = flagged.length - criticalCount;
  const tone = criticalCount > 0 ? 'negative' : 'warning';

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={`${styles.trigger} ${styles[tone]}`} onClick={() => setOpen((o) => !o)}>
        <span className={styles.dot} />
        {flagged.length} liquidity flag{flagged.length === 1 ? '' : 's'}
      </button>

      {open && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Liquidity Decay</h3>
          <p className={styles.panelText}>
            {criticalCount > 0 && <>{criticalCount} critical{warningCount > 0 ? ', ' : ''}</>}
            {warningCount > 0 && <>{warningCount} thinning</>}
            {' '}- open positions whose liquidity has meaningfully degraded since entry. Check the Liquidity
            column on Position Log, CSP Positions, Active Spreads, or BWB Trades for which ones and why.
          </p>
        </div>
      )}
    </div>
  );
}
