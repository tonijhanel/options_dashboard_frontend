import styles from './StatusBadge.module.css';

// title (native HTML tooltip) is a no-op when status.reason is undefined,
// so this stays backward-compatible with every existing caller whose
// status objects have no reason field - only badges that provide one
// (docs/coveredcalltable.md's package_status) get a hover tooltip.
export default function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${styles[status.tone]}`} title={status.reason}>{status.label}</span>;
}
