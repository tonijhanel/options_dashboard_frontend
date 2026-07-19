import { useState, useRef, useEffect } from 'react';
import MarkdownText from './MarkdownText';
import styles from './NewsPreview.module.css';

/**
 * For the truncated hover tooltip specifically (not the full expanded
 * view) - CSS line-clamp doesn't reliably truncate across nested block
 * elements from a fully-rendered markdown tree (headers, paragraphs), so
 * a quick plain-text strip works better here than actually rendering
 * markdown into a clamped container.
 */
function stripMarkdownForPreview(text) {
  if (!text) return '';
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}

function timeAgo(isoString) {
  if (!isoString) return null;
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NewsPreview({ scope, scopeKey, getEntry, children }) {
  const [hovering, setHovering] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);

  const entry = getEntry(scope, scopeKey);

  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setExpanded(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  // No news data for this ticker/sector - render as plain text, don't
  // promise an interactive preview that has nothing behind it.
  if (!entry) return <>{children}</>;

  return (
    <span
      ref={ref}
      className={styles.wrap}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={(e) => {
        e.stopPropagation(); // don't trigger a parent row's onClick (e.g. Positions table row selection)
        setExpanded((v) => !v);
      }}
    >
      <span className={styles.trigger}>{children}</span>

      {hovering && !expanded && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipMeta}>
            {entry.sentiment_lean && <span className={styles.lean}>{entry.sentiment_lean}</span>}
            <span className={styles.timestamp}>{timeAgo(entry.created_at)}</span>
          </div>
          <div className={styles.preview}>{stripMarkdownForPreview(entry.summary)}</div>
          <div className={styles.hint}>Click for full analysis</div>
        </div>
      )}

      {expanded && (
        <div className={styles.popover} onClick={(e) => e.stopPropagation()}>
          <div className={styles.popoverHeader}>
            <strong>{scopeKey}</strong>
            <span className={styles.timestamp}>{timeAgo(entry.created_at)}</span>
          </div>
          {entry.sentiment_lean && <div className={styles.lean}>{entry.sentiment_lean}</div>}
          <div className={styles.fullSummary}>
            <MarkdownText>{entry.summary}</MarkdownText>
          </div>
        </div>
      )}
    </span>
  );
}