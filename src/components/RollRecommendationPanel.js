import styles from './RollRecommendationPanel.module.css';

const TIER_COPY = {
  action: {
    heading: 'ACTION RECOMMENDED (DEFENSIVE ROLL)',
    icon: '🚨',
    tone: 'negative',
    body: (r) => `The stock price has broken past your safety floor, or the assignment threat is critically high (${r.assignmentProb.toFixed(1)}% risk).`,
    stepsHeading: 'Exact Defensive Steps to Take:',
    steps: ['Buy to Close your current contract right now to stop the bleeding.', 'Sell to Open a new contract in the next monthly expiration cycle.'],
    planHeading: null,
  },
  caution: {
    heading: 'MONITOR CLOSELY (CAUTION ZONE)',
    icon: '⚠️',
    tone: 'warning',
    body: (r) => `The stock is compressing toward your strike price. Your downside safety cushion is narrowing to ${r.cushion.toFixed(1)}%, and assignment probability has reached ${r.assignmentProb.toFixed(1)}%.`,
    stepsHeading: null,
    steps: [],
    planHeading: 'Future Backup Plan (only used if position deteriorates):',
  },
  safe: {
    heading: 'NO ACTION REQUIRED',
    icon: '✅',
    tone: 'positive',
    body: () => 'Do not place any trades. This position is completely safe, healthy, and successfully making money from normal decay.',
    stepsHeading: null,
    steps: [],
    planHeading: 'Future Backup Plan (only used if stock drops below strike):',
  },
};

export default function RollRecommendationPanel({ ticker, strike, spot, recommendation }) {
  const copy = TIER_COPY[recommendation.tier];

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Position Review: {ticker}</h2>
      <div className={styles.meta}>
        Current Strike <span className="num">${strike.toFixed(2)}</span> | Current Stock Price{' '}
        <span className="num">${spot.toFixed(2)}</span>
      </div>

      <div className={`${styles.instruction} ${styles[copy.tone]}`}>
        {copy.icon} CURRENT INSTRUCTION: {copy.heading}
      </div>

      <p className={styles.body}>{copy.body(recommendation)}</p>

      {copy.steps.length > 0 && (
        <>
          <div className={styles.subheading}>{copy.stepsHeading}</div>
          <ol className={styles.steps}>
            {copy.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}

      {copy.planHeading && (
        <div className={styles.plan}>
          <div className={styles.subheading}>🔮 {copy.planHeading}</div>
          <div>• Action: Buy back this contract to close it, and sell a new one expiring next month.</div>
          <div>
            • Target Defensive Strike Price: <span className="num">${recommendation.targetStrike.toFixed(2)}</span>
          </div>
          <div>
            • Estimated Additional Cash Credit:{' '}
            <span className="num">+${recommendation.estimatedCredit.toFixed(2)}</span> / contract
          </div>
        </div>
      )}

      {recommendation.tier === 'action' && (
        <div className={styles.plan}>
          <div>
            🎯 Target Defensive Strike: <span className="num">${recommendation.targetStrike.toFixed(2)}</span>{' '}
            (moves your safety floor 5% lower)
          </div>
          <div>
            💵 Estimated Net Cash Collected: <span className="num">+${recommendation.estimatedCredit.toFixed(2)}</span> / contract
          </div>
        </div>
      )}
    </div>
  );
}