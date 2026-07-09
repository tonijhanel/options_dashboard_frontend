import styles from './CushionBar.module.css';
import NewsPreview from './NewsPreview';

export default function CushionBar({ ticker, strike, spot, cushionPct, assignmentProbPct, tone, getNewsEntry }) {
  // Matches dashboard.py's progress normalization: cushion/20%, capped at 100%
  const barWidth = Math.min(Math.max(cushionPct / 20, 0), 1) * 100;

  return (
    <div className={styles.row}>
      <div className={styles.header}>
        <span className={styles.ticker}>
          <NewsPreview scope="ticker" scopeKey={ticker} getEntry={getNewsEntry}>
            {ticker}
          </NewsPreview>
        </span>
        <span className={styles.meta}>
          Strike <span className="num">${strike.toFixed(2)}</span> | Spot <span className="num">${spot.toFixed(2)}</span>
        </span>
      </div>
      <div className={styles.barLabel}>{cushionPct.toFixed(1)}% downside buffer</div>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${barWidth}%` }} />
      </div>
      <div className={`${styles.assignmentLine} ${styles[tone]}`}>
        <span className={styles.dot} />
        Probability of assignment at expiration: <strong>{assignmentProbPct.toFixed(1)}%</strong>
      </div>
    </div>
  );
}