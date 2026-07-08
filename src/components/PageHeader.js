import styles from './PageHeader.module.css';

export default function PageHeader({ title, onRefresh, refreshing }) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <button className={styles.refreshButton} onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
