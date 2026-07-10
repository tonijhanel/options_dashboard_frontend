import { useState, useEffect, useCallback } from 'react';
import { getPnlRange } from '../api/client';
import { getPresetRange, PRESETS } from '../lib/dateRanges';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import tableStyles from '../components/Table.module.css';
import styles from './PnlHistoryPage.module.css';

export default function PnlHistoryPage() {
  const [range, setRange] = useState(() => getPresetRange('this_month'));
  const [activePreset, setActivePreset] = useState('this_month');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (start, end) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPnlRange(start, end);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(presetKey) {
    setActivePreset(presetKey);
    const newRange = getPresetRange(presetKey);
    setRange(newRange);
    fetchData(newRange.start, newRange.end);
  }

  function applyCustomRange(e) {
    e.preventDefault();
    setActivePreset(null);
    fetchData(range.start, range.end);
  }

  if (loading && !data) return <LoadingView label="Loading P&L history" />;

  return (
    <div>
      <PageHeader title="P&L History" onRefresh={() => fetchData(range.start, range.end)} refreshing={loading} />

      <p className={styles.explainer}>
        <strong>Premium Collected</strong> counts every position opened in this range, whether it's
        still open or has since closed - it won't shrink as positions close. <strong>Realized P&amp;L</strong>{' '}
        only counts positions actually closed within this range, using their recorded close price.
      </p>

      <div className={styles.controls}>
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={activePreset === p.key ? styles.presetActive : styles.preset}
              onClick={() => applyPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={applyCustomRange} className={styles.customRange}>
          <label>
            From
            <input
              type="date"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className={styles.dateInput}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className={styles.dateInput}
            />
          </label>
          <button type="submit" className={styles.applyButton}>Apply</button>
        </form>
      </div>

      {error && <ErrorView message={error} onRetry={() => fetchData(range.start, range.end)} />}

      {data && (
        <>
          <SummaryBar
            items={[
              {
                label: 'Premium Collected',
                value: data.premium_collected.total,
                sub: `${data.premium_collected.count} position(s) opened in range`,
                subTone: 'neutral',
              },
              {
                label: 'Realized P&L',
                value: data.realized_pnl.realized_pnl,
                subTone: data.realized_pnl.realized_pnl >= 0 ? 'positive' : undefined,
                sub: data.realized_pnl.missing_price_count > 0
                  ? `${data.realized_pnl.missing_price_count} close(s) missing price - not included`
                  : `${data.realized_pnl.closed_count} position(s) closed in range`,
              },
            ]}
          />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Positions Opened in Range</h2>
            {data.premium_collected.positions.length === 0 ? (
              <EmptyView message="No positions opened in this range." />
            ) : (
              <div className={tableStyles.tableWrap}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Type</th>
                      <th>Strike</th>
                      <th>Contracts</th>
                      <th>Entry Price</th>
                      <th>Entry Date</th>
                      <th>Premium</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.premium_collected.positions.map((p) => (
                      <tr key={p.id}>
                        <td className={styles.ticker}>{p.ticker}</td>
                        <td>{p.position_type === 'vertical_spread' ? 'Spread' : 'Naked Put'}</td>
                        <td className="num">
                          {p.position_type === 'vertical_spread' ? `${p.short_strike}/${p.long_strike}` : p.strike?.toFixed(2)}
                        </td>
                        <td className="num">{p.contracts}</td>
                        <td className="num">{p.entry_price?.toFixed(2)}</td>
                        <td>{p.entry_date ? new Date(p.entry_date).toLocaleDateString() : '—'}</td>
                        <td className="num">{p.premium !== null ? formatCurrency(p.premium) : '—'}</td>
                        <td className={p.status === 'open' ? styles.statusOpen : tableStyles.muted}>{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Positions Closed in Range</h2>
            {data.realized_pnl.positions.length === 0 ? (
              <EmptyView message="No positions closed in this range." />
            ) : (
              <div className={tableStyles.tableWrap}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Entry Price</th>
                      <th>Closed Price</th>
                      <th>Closed Date</th>
                      <th>Close Reason</th>
                      <th>P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.realized_pnl.positions.map((p) => (
                      <tr key={p.id}>
                        <td className={styles.ticker}>{p.ticker}</td>
                        <td className="num">{p.entry_price?.toFixed(2)}</td>
                        <td className="num">{p.closed_price !== null ? p.closed_price.toFixed(2) : '—'}</td>
                        <td>{p.closed_date ? new Date(p.closed_date).toLocaleDateString() : '—'}</td>
                        <td className={p.close_reason ? '' : tableStyles.muted}>{p.close_reason || 'not recorded'}</td>
                        <td className={`num ${p.realized_pnl === null ? tableStyles.muted : p.realized_pnl >= 0 ? tableStyles.positive : tableStyles.negative}`}>
                          {p.realized_pnl !== null ? formatCurrency(p.realized_pnl) : 'missing price'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}