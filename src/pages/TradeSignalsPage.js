import { useState, useMemo } from 'react';
import { getTradeSignals } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import SignalPill from '../components/SignalPill';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
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

const SIGNAL_FILTERS = ['ALL', 'FAVORABLE', 'NEUTRAL', 'AVOID'];

// FAVORABLE-first, missing data last - matches SignalPill's tone ordering
// and useSortableData's own "nulls always sort to the bottom" behavior.
const SIGNAL_RANK = { FAVORABLE: 0, NEUTRAL: 1, AVOID: 2 };

// Indicators are computed ONCE per ticker on the backend (RSI/SMA/spot/IV
// are ticker-level facts, not strategy-level - see trade_signal_service.
// evaluate_strategy_signals_bulk) and identically attached to every
// strategy_type result for that ticker. Pull them off whichever strategy
// cell happens to be present rather than duplicating per-strategy.
function getIndicators(row) {
  for (const col of STRATEGY_COLUMNS) {
    if (row[col.key]?.indicators) return row[col.key].indicators;
  }
  return null;
}

function fmtNum(value, decimals = 2) {
  return value === null || value === undefined ? '—' : value.toFixed(decimals);
}

function renderPill(cell) {
  return cell ? <SignalPill signal={cell.signal} reason={cell.reason} indicators={cell.indicators} /> : '—';
}

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true,
    getSortValue: (row) => row.ticker,
    render: (row) => <span className={styles.ticker}>{row.ticker}</span> },
  { key: 'spot_price', label: 'Spot', sortable: true,
    getSortValue: (row) => getIndicators(row)?.spot_price,
    render: (row) => fmtNum(getIndicators(row)?.spot_price) },
  { key: 'rsi_14', label: 'RSI-14', sortable: true,
    getSortValue: (row) => getIndicators(row)?.rsi_14,
    render: (row) => fmtNum(getIndicators(row)?.rsi_14) },
  { key: 'sma_50', label: 'SMA-50', sortable: true,
    getSortValue: (row) => getIndicators(row)?.sma_50,
    render: (row) => fmtNum(getIndicators(row)?.sma_50) },
  { key: 'sma_200', label: 'SMA-200', sortable: true,
    getSortValue: (row) => getIndicators(row)?.sma_200,
    render: (row) => fmtNum(getIndicators(row)?.sma_200) },
  { key: 'iv_rv_ratio', label: 'IV/RV', sortable: true,
    getSortValue: (row) => getIndicators(row)?.iv_rv_ratio,
    render: (row) => fmtNum(getIndicators(row)?.iv_rv_ratio) },
  ...STRATEGY_COLUMNS.map((col) => ({
    key: col.key, label: col.label, sortable: true,
    getSortValue: (row) => {
      const signal = row[col.key]?.signal;
      return signal ? SIGNAL_RANK[signal] : null;
    },
    render: (row) => renderPill(row[col.key]),
  })),
];

const NON_NUMERIC_COLUMNS = ['ticker', 'CSP', 'BWB', 'CREDIT_SPREAD_PUT', 'CREDIT_SPREAD_CALL'];

function groupByTicker(results) {
  const byTicker = {};
  for (const r of results || []) {
    if (!byTicker[r.ticker]) byTicker[r.ticker] = { ticker: r.ticker };
    byTicker[r.ticker][r.strategy_type] = r;
  }
  return Object.values(byTicker);
}

export default function TradeSignalsPage() {
  const { data, error, loading, refetch } = useApiData(getTradeSignals, 'trade-signals');
  const [tickerSearch, setTickerSearch] = useState('');
  const [strategyScope, setStrategyScope] = useState('ALL');
  const [signalFilter, setSignalFilter] = useState('ALL');
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'tradeSignalsTable', []);

  const rows = useMemo(() => groupByTicker(data?.results), [data]);

  const filtered = useMemo(() => {
    const scopedColumns = strategyScope === 'ALL' ? STRATEGY_COLUMNS.map((c) => c.key) : [strategyScope];
    return rows.filter((row) => {
      if (tickerSearch && !row.ticker.toLowerCase().includes(tickerSearch.trim().toLowerCase())) return false;
      if (signalFilter === 'ALL') return true;
      return scopedColumns.some((key) => row[key]?.signal === signalFilter);
    });
  }, [rows, tickerSearch, strategyScope, signalFilter]);

  const { sorted, sortKey, direction, requestSort } = useSortableData(
    filtered,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

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
        Scan / BWB entry next, not a ready-to-trade setup on its own. Click a pill for the reason.
      </p>

      <div className={styles.controlsRow}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Filter by ticker…"
          value={tickerSearch}
          onChange={(e) => setTickerSearch(e.target.value)}
        />

        <select
          className={styles.strategySelect}
          value={strategyScope}
          onChange={(e) => setStrategyScope(e.target.value)}
        >
          <option value="ALL">Any strategy</option>
          {STRATEGY_COLUMNS.map((col) => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>

        <div className={styles.filterRow}>
          {SIGNAL_FILTERS.map((option) => (
            <button
              key={option}
              className={option === signalFilter ? styles.filterActive : styles.filter}
              onClick={() => setSignalFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <ColumnPicker columns={COLUMNS} hidden={hidden} onToggle={toggle} />
      </div>

      {sorted.length === 0 ? (
        <EmptyView message="No tickers match this filter." />
      ) : (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <SortableHeader
                    key={col.key}
                    label={col.label}
                    columnKey={col.key}
                    sortable={col.sortable}
                    sortKey={sortKey}
                    direction={direction}
                    onSort={requestSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.ticker}>
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'}>
                      {col.render(row)}
                    </td>
                  ))}
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
