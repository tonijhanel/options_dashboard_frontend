import { useState, useEffect, useRef, useCallback } from 'react';
import { getSnapTradeConnectionStatus } from '../api/client';
import styles from './SnapTradeConnectionStatus.module.css';

// Global nav pill, same poll-and-dropdown pattern as LiquidityStatusBadge/
// SchwabTokenStatus. Built after a real incident: an E*Trade connection
// went disabled at SnapTrade, but the first sign of it was a closed GLD
// position reappearing as "open" days later - SnapTrade kept serving its
// last-cached (pre-close) holdings with no way to know the connection
// could no longer refresh. This surfaces SnapTrade's own `disabled` flag
// directly instead of waiting for that kind of downstream symptom.
export default function SnapTradeConnectionStatus() {
  const [connections, setConnections] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await getSnapTradeConnectionStatus();
      setConnections(result.connections || []);
    } catch {
      setConnections(null);
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

  if (!connections) return null;
  const disabled = connections.filter((c) => c.disabled);

  // Nothing wrong - don't clutter the nav with a permanent "all connected" widget.
  if (disabled.length === 0) return null;

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={`${styles.trigger} ${styles.negative}`} onClick={() => setOpen((o) => !o)}>
        <span className={styles.dot} />
        {disabled.length} connection{disabled.length === 1 ? '' : 's'} disabled
      </button>

      {open && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>SnapTrade Connection</h3>
          <p className={styles.panelText}>
            {disabled.map((c) => c.brokerage || c.name).join(', ')} {disabled.length === 1 ? 'has' : 'have'} gone
            disabled at SnapTrade - usually an expired brokerage session or a changed password. Positions from
            this connection have stopped refreshing, and closed positions may keep reappearing until it's fixed.
          </p>
          <p className={styles.panelText}>
            Fix it by running <code>python -m backend.scripts.get_snaptrade_connection_url</code> from the
            project root and reauthorizing through the printed Connection Portal link.
          </p>
        </div>
      )}
    </div>
  );
}
