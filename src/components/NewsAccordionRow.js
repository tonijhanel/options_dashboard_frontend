import { useState } from 'react';
import MarkdownText from './MarkdownText';
import styles from './NewsAccordionRow.module.css';

function formatTimestamp(isoString) {
  if (!isoString) return 'never';
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function NewsAccordionRow({ title, lean, summary, updatedAt }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.row}>
      <button className={styles.header} onClick={() => setExpanded((e) => !e)}>
        <span className={styles.chevron}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.title}>{title}</span>
        {lean && <span className={styles.lean}>{lean}</span>}
        <span className={styles.spacer} />
        <span className={styles.updated}>Updated {formatTimestamp(updatedAt)}</span>
      </button>
      {expanded && (
        <div className={styles.body}>
          <MarkdownText>{summary}</MarkdownText>
        </div>
      )}
    </div>
  );
}