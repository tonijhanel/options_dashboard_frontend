import styles from './TradeSignalBadge.module.css';

export default function TradeSignalBadge({ signal }) {
  const isTrade = signal === 'TRADE';
  return <span className={`${styles.badge} ${isTrade ? styles.trade : styles.wait}`}>{signal}</span>;
}
