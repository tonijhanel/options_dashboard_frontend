import { useState } from 'react';
import RollRecommendationPanel from './RollRecommendationPanel';
import styles from './PositionReviewHover.module.css';

/**
 * Wraps the Status badge in the Positions table - hovering shows the full
 * Position Review (same content as the click-to-select detail panel
 * below the table) without needing to select the row first. Same
 * hover-popover pattern as NewsPreview.
 */
export default function PositionReviewHover({ ticker, strike, spot, recommendation, children }) {
  const [hovering, setHovering] = useState(false);

  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={(e) => e.stopPropagation()} // don't trigger the row's onClick (row selection)
    >
      {children}

      {hovering && (
        <div className={styles.popover}>
          <RollRecommendationPanel ticker={ticker} strike={strike} spot={spot} recommendation={recommendation} />
        </div>
      )}
    </span>
  );
}
