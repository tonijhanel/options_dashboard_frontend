import styles from './ROCTierBadge.module.css';

const TIER_LABELS = {
  skip: 'SKIP',
  sweet_spot: 'SWEET SPOT',
  alpha: 'ALPHA ZONE',
};

export default function ROCTierBadge({ tier }) {
  if (!tier) return <span className={styles.none}>—</span>;
  return <span className={`${styles.badge} ${styles[tier]}`}>{TIER_LABELS[tier]}</span>;
}