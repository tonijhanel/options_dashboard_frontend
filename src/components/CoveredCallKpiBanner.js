import styles from './SummaryBar.module.css';

// Doc-specified format (docs/coveredcalltable.md section 3): always 2
// decimal places, unlike SummaryBar's shared formatCurrency (whole
// dollars, no sign prefix) - that's why this is its own small component
// rather than a SummaryBar usage, even though it reuses SummaryBar's
// card-grid CSS classes for visual consistency with the rest of the app.
function formatUsd(value, { signPrefix = false } = {}) {
  const amount = value || 0;
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  if (!signPrefix) return amount < 0 ? `-${formatted}` : formatted;
  return amount >= 0 ? `+${formatted}` : `-${formatted}`;
}

// docs/coveredcalltable.md's Clarification doc: a fixed 4-metric banner,
// NOT average per-row percentages or a status-tier tally - four dollar
// figures aggregated across active covered call positions only.
export default function CoveredCallKpiBanner({ totalCapitalDeployed, grossPremiumCollected, aggregateOpenPnl, liquidityUnlockingFriday }) {
  return (
    <div className={styles.bar}>
      <div className={styles.card}>
        <div className={styles.label}>Total Capital Committed</div>
        <div className={`${styles.value} num`}>{formatUsd(totalCapitalDeployed)}</div>
        <div className={`${styles.sub} ${styles.neutral}`}>Total physical stock basis</div>
      </div>
      <div className={styles.card}>
        <div className={styles.label}>Gross Premium Cash</div>
        <div className={`${styles.value} num`}>{formatUsd(grossPremiumCollected)}</div>
        <div className={`${styles.sub} ${styles.positive}`}>Day-one cash buffer retained</div>
      </div>
      <div className={styles.card}>
        <div className={styles.label}>Open Package P&amp;L</div>
        <div className={`${styles.value} num`}>{formatUsd(aggregateOpenPnl, { signPrefix: true })}</div>
        <div className={`${styles.sub} ${aggregateOpenPnl >= 0 ? styles.positive : styles.negative}`}>Live liquidation value</div>
      </div>
      <div className={styles.card}>
        <div className={styles.label}>Liquidity Unlocking Friday</div>
        <div className={`${styles.value} num`}>{formatUsd(liquidityUnlockingFriday)}</div>
        <div className={`${styles.sub} ${styles.info}`}>Capital returning on assignment</div>
      </div>
    </div>
  );
}
