import tableStyles from './Table.module.css';
import styles from './MarketIndexesTicker.module.css';

function formatPrice(value) {
  if (value == null) return '-';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChange(change, changePct) {
  if (change == null) return null;
  const sign = change >= 0 ? '+' : '';
  const pct = changePct != null ? ` (${sign}${changePct.toFixed(2)}%)` : '';
  return `${sign}${change.toFixed(2)}${pct}`;
}

// A small fixed ticker strip - S&P 500/Dow/Nasdaq/VIX/Gold/Russell 2000 -
// for at-a-glance market context, the kind of row you'd see across the
// top of Yahoo Finance. Fails soft/quiet: renders nothing at all rather
// than an error banner if GET /market-indexes hasn't loaded or failed,
// since this is peripheral context for the page, not something worth
// interrupting the rest of the home page over.
export default function MarketIndexesTicker({ indexes }) {
  if (!indexes || indexes.length === 0) return null;

  return (
    <div className={styles.strip}>
      {indexes.map((idx) => {
        const changeText = formatChange(idx.change, idx.change_pct);
        const tone = idx.change == null ? '' : idx.change >= 0 ? tableStyles.positive : tableStyles.negative;
        return (
          <div key={idx.symbol} className={styles.tile}>
            <span className={styles.label}>{idx.label}</span>
            <span className={styles.price}>{formatPrice(idx.price)}</span>
            {changeText && <span className={`${styles.change} ${tone}`}>{changeText}</span>}
          </div>
        );
      })}
    </div>
  );
}
