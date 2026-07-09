import styles from './InsightsList.module.css';

export default function InsightsList({ insights }) {
  return (
    <ul className={styles.list}>
      {insights.map((insight) => (
        <li key={insight.ticker} className={styles.item}>
          <span className={`${styles.dot} ${styles[insight.tone]}`} />
          <span>
            <strong>{insight.ticker}</strong> {insight.text.slice(insight.ticker.length + 1)}
          </span>
        </li>
      ))}
    </ul>
  );
}