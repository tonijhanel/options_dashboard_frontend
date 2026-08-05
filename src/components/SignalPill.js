import { useState, useRef, useEffect } from 'react';
import styles from './SignalPill.module.css';

const TONE = { FAVORABLE: 'positive', NEUTRAL: 'warning', AVOID: 'negative' };

// Stage 1 Trade Signal Engine (docs/tradesignals.md) result pill -
// FAVORABLE/NEUTRAL/AVOID/null (null = indicator fetch failed for this
// ticker, reason explains why). Click to see the reason and the raw
// indicator values it was computed from, same click-to-expand pattern as
// the nav health badges (LiquidityStatusBadge/SnapTradeConnectionStatus).
export default function SignalPill({ signal, reason, indicators }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!signal) {
    return <span className={`${styles.pill} ${styles.unknown}`} title={reason || 'No data'}>—</span>;
  }

  const tone = TONE[signal] || 'unknown';

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={`${styles.pill} ${styles[tone]}`} onClick={() => setOpen((o) => !o)}>
        {signal}
      </button>
      {open && (
        <div className={styles.panel}>
          <p className={styles.reason}>{reason}</p>
          {indicators && (
            <dl className={styles.indicators}>
              <dt>Spot</dt><dd>{fmt(indicators.spot_price)}</dd>
              <dt>RSI-14</dt><dd>{fmt(indicators.rsi_14)}</dd>
              <dt>SMA-50</dt><dd>{fmt(indicators.sma_50)}</dd>
              <dt>SMA-200</dt><dd>{fmt(indicators.sma_200)}</dd>
              <dt>IV/RV</dt><dd>{fmt(indicators.iv_rv_ratio)}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(value) {
  return value === null || value === undefined ? '—' : value;
}
