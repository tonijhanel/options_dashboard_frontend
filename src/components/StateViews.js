import styles from './StateViews.module.css';

export function LoadingView({ label = 'Loading' }) {
  return <div className={styles.state}>{label}…</div>;
}

export function ErrorView({ message, onRetry }) {
  return (
    <div className={`${styles.state} ${styles.error}`}>
      <p>{message}</p>
      {onRetry && (
        <button className={styles.retryButton} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyView({ message }) {
  return <div className={styles.state}>{message}</div>;
}
