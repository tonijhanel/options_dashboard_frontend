import styles from './RecommendationBadge.module.css';

const TIER_LABELS = {
  action: 'Action Needed',
  caution: 'Monitor',
  safe: 'Safe',
};

export default function RecommendationBadge({ tier }) {
  return <span className={`${styles.badge} ${styles[tier]}`}>{TIER_LABELS[tier]}</span>;
}