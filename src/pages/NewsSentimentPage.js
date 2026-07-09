import { useState } from 'react';
import { hardRefreshNewsSentiment } from '../api/client';
import { useNewsSentiment } from '../lib/useNewsSentiment';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import NewsAccordionRow from '../components/NewsAccordionRow';
import tableStyles from '../components/Table.module.css';
import styles from './NewsSentimentPage.module.css';

export default function NewsSentimentPage() {
  const { data, error, loading, refetch } = useNewsSentiment();
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [hardRefreshError, setHardRefreshError] = useState(null);
  const [confirmingHardRefresh, setConfirmingHardRefresh] = useState(false);

  async function handleHardRefresh() {
    setConfirmingHardRefresh(false);
    setHardRefreshing(true);
    setHardRefreshError(null);
    try {
      await hardRefreshNewsSentiment();
      await refetch(); // pick up what the hard refresh just wrote
    } catch (e) {
      setHardRefreshError(e.message);
    } finally {
      setHardRefreshing(false);
    }
  }

  if (loading && !data) return <LoadingView label="Loading news & sentiment" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  const results = data.results || [];
  const tickerResults = results.filter((r) => r.scope === 'ticker');
  const sectorResults = results.filter((r) => r.scope === 'sector');

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>News &amp; Sentiment</h1>
        <div className={styles.actions}>
          <button className={styles.refreshButton} onClick={refetch} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className={styles.hardRefreshButton}
            onClick={() => setConfirmingHardRefresh(true)}
            disabled={hardRefreshing}
          >
            {hardRefreshing ? 'Running analysis…' : 'Hard Refresh'}
          </button>
        </div>
      </div>

      <p className={styles.explainer}>
        This data comes from a scheduled backend job (8:30am ET daily) - "Refresh" just re-reads what's
        already stored (free). "Hard Refresh" runs a brand new fetch + analysis right now, which uses
        real Alpha Vantage quota (25/day free tier) - use it sparingly.
      </p>

      {confirmingHardRefresh && (
        <div className={styles.confirmBox}>
          <p>
            This will fetch fresh headlines and run a new Claude analysis for every open position -
            using part of your daily Alpha Vantage quota. Continue?
          </p>
          <div className={styles.confirmActions}>
            <button className={styles.confirmYes} onClick={handleHardRefresh}>
              Yes, run it
            </button>
            <button className={styles.confirmNo} onClick={() => setConfirmingHardRefresh(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {hardRefreshError && <ErrorView message={hardRefreshError} />}
      {error && <ErrorView message={error} onRetry={refetch} />}

      {results.length === 0 ? (
        <EmptyView message="No news/sentiment data yet - it populates automatically each morning at 8:30am ET, or use Hard Refresh to run it now." />
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>By Ticker</h2>
            {tickerResults.length === 0 ? (
              <EmptyView message="No per-ticker analysis yet." />
            ) : (
              <div className={tableStyles.tableWrap}>
                {tickerResults.map((r) => (
                  <NewsAccordionRow key={r.scope_key} title={r.scope_key} lean={r.sentiment_lean} summary={r.summary} updatedAt={r.created_at} />
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>By Sector</h2>
            {sectorResults.length === 0 ? (
              <EmptyView message="No per-sector synthesis yet." />
            ) : (
              <div className={tableStyles.tableWrap}>
                {sectorResults.map((r) => (
                  <NewsAccordionRow key={r.scope_key} title={r.scope_key} lean={r.sentiment_lean} summary={r.summary} updatedAt={r.created_at} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}