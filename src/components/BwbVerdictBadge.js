import styles from './BwbVerdictBadge.module.css';

const COPY = {
  SUFFICIENT: { label: '🟢 SUFFICIENT', tone: 'positive' },
  INSUFFICIENT: { label: '🔴 INSUFFICIENT', tone: 'negative' },
  RISK_FREE: { label: '🔵 RISK-FREE ENTRY', tone: 'accent' },
};

export default function BwbVerdictBadge({ verdict }) {
  const copy = COPY[verdict];
  if (!copy) return null;
  return <span className={`${styles.badge} ${styles[copy.tone]}`}>{copy.label}</span>;
}
