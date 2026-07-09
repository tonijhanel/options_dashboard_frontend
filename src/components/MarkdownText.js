import ReactMarkdown from 'react-markdown';
import styles from './MarkdownText.module.css';

/**
 * Claude's summaries (services/claude_client.py's prompts) come back as
 * markdown - headers, bold text - which was previously rendered as plain
 * text, showing literal "# SCHD Morning Summary" and "**Summary:**"
 * instead of actually formatting it. This renders it properly.
 */
export default function MarkdownText({ children }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}