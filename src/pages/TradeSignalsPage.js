import { useState, useMemo } from 'react';
import { getTradeSignals } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import SignalPill from '../components/SignalPill';
import tableStyles from '../components/Table.module.css';
import styles from './TradeSignalsPage.module.css';

// Stage 1 Trade Signal Engine (docs/tradesignals.md) - a chain-free,
// watchlist-wide "does this ticker's setup favor this strategy" screen.
// Explicitly a PRE-FILTER: a FAVORABLE cell still needs Stage 2 (Single
// Position Scan / Credit Spread Scan / BWB entry) to pick actual strikes -
// this page has no strike selection or RoR numbers at all.
const STRATEGY_COLUMNS = [
  { key: 'CSP', label: 'CSP' },
  { key: 'BWB', label: 'BWB' },
  { key: 'CREDIT_SPREAD_PUT', label: 'Credit Spread (Put)' },
  { key: 'CREDIT_SPREAD_CALL', label: 'Credit Spread (Call)' },
];

function groupByTicker(results) {
  const byTicker = {};
  for (const r of results || []) {
    if (!byTicker[r.ticker]) byTicker[r.ticker] = { ticker: r.ticker };
    byTicker[r.ticker][r.strategy_type] = r;
  }
  return Object.values(byTicker).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export default function TradeSignalsPage() {
  const { data, error, loading, refetch } = useApiData(getTradeSignals, 'trade-signals');
  const [onlyFavorable, setOnlyFavorable] = useState(false);

  const rows = useMemo(() => groupByTicker(data?.results), [data]);
  const filtered = onlyFavorable
    ? rows.filter((row) => STRATEGY_COLUMNS.some((c) => row[c.key]?.signal === 'FAVORABLE'))
    : rows;

  if (loading && !data) return <LoadingView label="Evaluating watchlist" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Trade Signals" onRefresh={refetch} refreshing={loading} />

      {error && <ErrorView message={error} onRetry={refetch} />}

      <p className={styles.intro}>
        Chain-free directional flag per ticker/strategy, using only RSI, SMA-50/200, spot, and IV/RV - no
        strikes, no RoR. A FAVORABLE cell is a candidate to run through Single Position Scan / Credit Spread
        Scan / BWB entry next, not a ready-to-trade setup on its own. Click a pill for the reason and indicator values.
      </p>

      <div className={styles.controlsRow}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={onlyFavorable}
            onChange={(e) => setOnlyFavorable(e.target.checked)}
          />
          Only show tickers with at least one FAVORABLE signal
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyView message="No tickers match this filter." />
      ) : (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Ticker</th>
                {STRATEGY_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.ticker}>
                  <td className={styles.ticker}>{row.ticker}</td>
                  {STRATEGY_COLUMNS.map((col) => {
                    const cell = row[col.key];
                    return (
                      <td key={col.key}>
                        {cell ? (
                          <SignalPill signal={cell.signal} reason={cell.reason} indicators={cell.indicators} />
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data._errors && (
        <div className={styles.errorsNote}>
          <strong>Some tickers didn't return data:</strong>
          <ul>
            {Object.entries(data._errors).map(([ticker, msg]) => (
              <li key={ticker}>
                {ticker}: {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
