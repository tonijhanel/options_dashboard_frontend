import styles from './SummaryBar.module.css';

function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function SummaryBar({ items }) {
  return (
    <div className={styles.bar}>
      {items.map((item) => (
        <div key={item.label} className={styles.card}>
          <div className={styles.label}>{item.label}</div>
          <div className={`${styles.value} num`}>{formatCurrency(item.value)}</div>
          {item.sub && <div className={`${styles.sub} ${styles[item.subTone || 'neutral']}`}>{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export { formatCurrency };
