import styles from './VerdictBadge.module.css';

// Shared sufficiency-verdict pill - used by both pre-trade evaluators
// (Evaluate BWB Trades, Evaluate Credit Spreads). RISK_FREE is BWB-only
// (a credit spread's validation requires a strictly positive max loss, so
// it never produces this tier - see docs/credit_eval.md's validation
// rules vs. docs/bwb_eval.md's risk-free case handling).
const COPY = {
  SUFFICIENT: { label: '🟢 SUFFICIENT', tone: 'positive' },
  INSUFFICIENT: { label: '🔴 INSUFFICIENT', tone: 'negative' },
  RISK_FREE: { label: '🔵 RISK-FREE ENTRY', tone: 'accent' },
};

export default function VerdictBadge({ verdict }) {
  const copy = COPY[verdict];
  if (!copy) return null;
  return <span className={`${styles.badge} ${styles[copy.tone]}`}>{copy.label}</span>;
}
