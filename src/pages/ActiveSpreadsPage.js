import { useEffect, useMemo, useState } from 'react';
import { getActiveSpreads, updatePositionLogEntry, getIgnoredPositions, ignorePosition, unignorePosition, getLiquidityStatus } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { pctOfMaxProfitCaptured, profitCaptureStatus } from '../lib/profitCaptured';
import { evaluateCreditSpread } from '../lib/creditSpreadEval';
import { computeDTE } from '../lib/dte';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import LiquidityBadge from '../components/LiquidityBadge';
import StatusBadge from '../components/StatusBadge';
import ProfitTargetSlider from '../components/ProfitTargetSlider';
import CreditSpreadEvalChart from '../components/CreditSpreadEvalChart';
import tableStyles from '../components/Table.module.css';
import styles from './ActiveSpreadsPage.module.css';

const LIQUIDITY_RANK = { critical: 0, warning: 1, ok: 2 };
const STATUS_RANK = { 'take-profit': 0, 'roll-hold': 1 };

// Days between today and the row's own expiration - the Credit Spread
// Evaluator's math (lib/creditSpreadEval.js) needs SOME dte to run its
// probability/EV calc, even though the at-expiration curve itself
// (all this panel actually displays) doesn't depend on it at all.
// Floored at 1 so an expiration-day position doesn't fail validation.
function daysToExpiration(expiration) {
  if (!expiration) return null;
  const ms = new Date(expiration) - new Date();
  return Math.max(1, Math.ceil(ms / 86400000));
}

// Reuses the standalone Credit Spread Evaluator's own math/chart
// (lib/creditSpreadEval.js, CreditSpreadEvalChart.js) fed from this
// ALREADY-OPEN position's real strikes/credit/contracts instead of a
// hand-typed hypothetical - at-expiration payoff shape only ("Tier 1"
// scope, 2026-08). iv is left unspecified (defaults to 30% inside the
// evaluator) and only feeds the probability/EV numbers this panel
// doesn't show - live IV per leg isn't fetched anywhere on this page,
// so those numbers would be misleading if displayed; the curve itself
// doesn't use iv/dte at all.
function SpreadChartPanel({ row }) {
  const result = evaluateCreditSpread({
    shortStrike: row.short_strike,
    longStrike: row.long_strike,
    netCreditPerShare: row.net_entry,
    contracts: row.contracts,
    currentSpot: row.spot_price,
    dte: daysToExpiration(row.expiration),
  });

  if (!result.valid) {
    return (
      <div className={styles.chartPanel}>
        <p className={styles.chartError}>Can't chart this position: {result.errors.join(' ')}</p>
      </div>
    );
  }

  return (
    <div className={styles.chartPanel}>
      <p className={styles.chartSummary}>
        Max Profit <strong className={tableStyles.positive}>{formatCurrency(result.totalMaxProfit)}</strong>
        {' · '}
        Max Loss <strong className={tableStyles.negative}>-{formatCurrency(result.totalMaxLoss)}</strong>
        {' · '}
        Breakeven <strong>${result.breakeven.toFixed(2)}</strong>
      </p>
      <CreditSpreadEvalChart
        curve={result.curve}
        shortStrike={result.shortStrike}
        longStrike={result.longStrike}
        currentSpot={result.currentSpot}
        spotPnl={result.spotPnl}
        totalMaxProfit={result.totalMaxProfit}
        totalMaxLoss={result.totalMaxLoss}
        breakeven={result.breakeven}
      />
    </div>
  );
}

// Same visual/interaction pattern as Position Log's own Close action
// (docs/spreadclose.md - reuses the existing PATCH /position-log/<id>
// route and close_position_log logic exactly as-is, no new backend
// route). Pre-fills both price fields from this row's own live
// short_mid/long_mid (already fetched for the Current Net Value column) -
// a reasonable starting point, overwritable with the real fill price.
function SpreadRowActions({ row, onClosed }) {
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shortClosePrice, setShortClosePrice] = useState(row.short_mid != null ? row.short_mid.toFixed(2) : '');
  const [longClosePrice, setLongClosePrice] = useState(row.long_mid != null ? row.long_mid.toFixed(2) : '');
  const [error, setError] = useState(null);

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      const spreadNetClose = shortClosePrice !== '' && longClosePrice !== ''
        ? Number(shortClosePrice) - Number(longClosePrice)
        : undefined;
      await updatePositionLogEntry(row.id, {
        status: 'closed',
        closed_price: spreadNetClose,
        short_close_price: shortClosePrice !== '' ? Number(shortClosePrice) : undefined,
        long_close_price: longClosePrice !== '' ? Number(longClosePrice) : undefined,
      });
      onClosed();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!closing) {
    return <button className={styles.actionButtonClose} onClick={() => setClosing(true)}>Close</button>;
  }

  return (
    <div className={styles.inlinePanel}>
      <label>
        Short Close Price
        <input
          type="number" step="0.01"
          value={shortClosePrice}
          onChange={(e) => setShortClosePrice(e.target.value)}
          className={styles.formInputSmall}
        />
      </label>
      <label>
        Long Close Price
        <input
          type="number" step="0.01"
          value={longClosePrice}
          onChange={(e) => setLongClosePrice(e.target.value)}
          className={styles.formInputSmall}
        />
      </label>
      <button className={styles.actionButtonClose} onClick={handleClose} disabled={saving}>
        {saving ? 'Closing…' : 'Confirm Close'}
      </button>
      <button className={styles.cancelButton} onClick={() => setClosing(false)}>Cancel</button>
      {error && <div className={styles.formError}>{error}</div>}
    </div>
  );
}

// Manual per-position exclusion (2026-07-23) - a spread is a DIFFERENT
// pipeline from the naked-put Positions page (this page reads already-
// logged position_log rows, not live SnapTrade detection directly), so
// it needs its own Ignore button hitting the same /ignored-positions
// endpoint with strike=short_strike - see
// docs/supabase_migration_ignored_positions_spreads.sql.
function IgnoreButton({ row, onIgnored }) {
  const [ignoring, setIgnoring] = useState(false);
  const [error, setError] = useState(null);

  async function handleIgnore() {
    setIgnoring(true);
    setError(null);
    try {
      await ignorePosition({
        ticker: row.ticker,
        strike: row.short_strike,
        long_strike: row.long_strike,
        expiration: row.expiration,
        contracts: row.contracts,
      });
      onIgnored();
    } catch (e) {
      setError(e.message);
    } finally {
      setIgnoring(false);
    }
  }

  return (
    <span className={styles.ignoreCell}>
      <button className={styles.ignoreButton} onClick={handleIgnore} disabled={ignoring}>
        {ignoring ? 'Ignoring…' : 'Ignore'}
      </button>
      {error && <span className={styles.ignoreError}>{error}</span>}
    </span>
  );
}

// Same column-definition pattern as PositionsPage/TspScanPage - one source
// of truth driving both the column picker and the sort logic.
const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'spot_price', label: 'Spot', sortable: true, getSortValue: (r) => r.spot_price,
    render: (r) => (r.spot_price != null ? r.spot_price.toFixed(2) : '—') },
  { key: 'short_strike', label: 'Short Strike', sortable: true, getSortValue: (r) => r.short_strike,
    render: (r) => r.short_strike?.toFixed(2) },
  { key: 'long_strike', label: 'Long Strike', sortable: true, getSortValue: (r) => r.long_strike,
    render: (r) => r.long_strike?.toFixed(2) },
  { key: 'break_even', label: 'Break Even', sortable: true, getSortValue: (r) => r.break_even,
    render: (r) => (r.break_even != null ? r.break_even.toFixed(2) : '—') },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration,
    render: (r) => r.expiration },
  { key: 'dte', label: 'DTE', sortable: true, getSortValue: (r) => computeDTE(r.expiration),
    render: (r) => computeDTE(r.expiration) },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.contracts,
    render: (r) => r.contracts },
  { key: 'net_entry', label: 'Net Entry', sortable: true, getSortValue: (r) => r.net_entry,
    render: (r) => (r.net_entry != null ? r.net_entry.toFixed(2) : '—') },
  { key: 'current_net_value', label: 'Current Net Value', sortable: true, getSortValue: (r) => r.current_net_value,
    render: (r) => (r.current_net_value != null ? r.current_net_value.toFixed(2) : '—') },
  { key: 'live_pnl', label: 'Live P&L', sortable: true, getSortValue: (r) => r.live_pnl,
    render: (r) => (
      r.live_pnl != null
        ? <span className={r.live_pnl >= 0 ? tableStyles.positive : tableStyles.negative}>{formatCurrency(r.live_pnl)}</span>
        : '—'
    ) },
  { key: 'days_held', label: 'Days Held', sortable: true, getSortValue: (r) => r.days_held,
    render: (r) => r.days_held ?? '—' },
  { key: 'roc', label: 'ROC', sortable: true, getSortValue: (r) => r.roc,
    render: (r) => (r.roc != null ? `${r.roc.toFixed(1)}%` : '—') },
  { key: 'annualized_roc', label: 'Annualized ROC', sortable: true, getSortValue: (r) => r.annualized_roc,
    render: (r) => (r.annualized_roc != null ? `${r.annualized_roc.toFixed(1)}%` : '—') },
  { key: 'pct_captured', label: 'Profit Captured', sortable: true, getSortValue: (r) => r.pctCaptured,
    render: (r) => (
      r.pctCaptured != null
        ? <span className={r.hitProfitTarget ? tableStyles.positive : ''}>{r.pctCaptured.toFixed(0)}%</span>
        : '—'
    ) },
  { key: 'status', label: 'Status', sortable: true,
    getSortValue: (r) => STATUS_RANK[r.status?.tone] ?? 2,
    render: (r) => (r.status ? <StatusBadge status={r.status} /> : '—') },
  { key: 'liquidity', label: 'Liquidity', sortable: true,
    getSortValue: (r) => LIQUIDITY_RANK[r.liquidity?.severity] ?? 3,
    render: (r) => <LiquidityBadge snapshot={r.liquidity} /> },
];

const NON_NUMERIC_COLUMNS = ['ticker', 'expiration', 'status', 'liquidity'];

export default function ActiveSpreadsPage() {
  const { data, error, loading, refetch } = useApiData(getActiveSpreads, 'activeSpreads');
  const { data: ignoredPositions, refetch: refetchIgnored } = useApiData(getIgnoredPositions, 'ignoredPositions');
  const { data: liquidityStatus } = useApiData(getLiquidityStatus, 'liquidityStatus');
  const [profitTarget, setProfitTarget] = useState(80);
  const [selectedId, setSelectedId] = useState(null);

  // Keyed by position_id (docs/liquiddecay.md) - every position_log row's
  // own id, regardless of position_type (naked_put, vertical_spread,
  // bwb_put all key their liquidity_snapshots the same way - see
  // services/liquidity_monitor.py's module docstring for why this is
  // position_id, not strategy_group).
  const liquidityByPosition = useMemo(() => {
    const map = {};
    (liquidityStatus?.results || []).forEach((snapshot) => {
      map[snapshot.position_id] = snapshot;
    });
    return map;
  }, [liquidityStatus]);

  const spreads = useMemo(
    () => (data?.spreads || []).map((r) => {
      // A credit vertical has no separate max_profit field - the entry
      // credit itself IS the max profit, realized when current_net_value
      // decays to 0 (see lib/profitCaptured.js).
      const maxProfitDollars = r.net_entry != null ? r.net_entry * 100 * r.contracts : null;
      const pctCaptured = pctOfMaxProfitCaptured(r.live_pnl, maxProfitDollars);
      return {
        ...r,
        liquidity: liquidityByPosition[r.id],
        pctCaptured,
        hitProfitTarget: pctCaptured != null && pctCaptured >= profitTarget,
        status: profitCaptureStatus(pctCaptured, profitTarget),
      };
    }),
    [data, liquidityByPosition, profitTarget]
  );
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'activeSpreadsTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    spreads,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  useEffect(() => {
    if (!selectedId && sorted.length > 0) {
      setSelectedId(sorted[0].id);
    }
  }, [sorted, selectedId]);

  const selected = sorted.find((r) => r.id === selectedId);

  if (loading && !data) return <LoadingView label="Loading active spreads" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Active Spreads" onRefresh={refetch} refreshing={loading} />

      <p className={styles.explainer}>
        Live P&amp;L for every open vertical spread, priced against current market quotes - not the
        static entry-day numbers shown on Position Log or P&amp;L History.
      </p>

      {error && <ErrorView message={error} onRetry={refetch} />}

      {sorted.length === 0 ? (
        <EmptyView message="No open vertical spreads right now." />
      ) : (
        <>
          <div className={styles.tableToolbar}>
            <ProfitTargetSlider value={profitTarget} onChange={setProfitTarget} />
            <ColumnPicker columns={COLUMNS} hidden={hidden} onToggle={toggle} />
          </div>

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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className={styles.clickableRow} onClick={() => setSelectedId(r.id)}>
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'}>
                        {col.render(r)}
                      </td>
                    ))}
                    <td className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                      <SpreadRowActions row={r} onClosed={refetch} />
                      <IgnoreButton row={r} onIgnored={() => { refetch(); refetchIgnored(); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <>
              <div className={styles.selectorRow}>
                <label htmlFor="spread-select" className={styles.selectorLabel}>
                  Chart - click a row above, or select here:
                </label>
                <select
                  id="spread-select"
                  className={styles.selector}
                  value={selectedId || ''}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                >
                  {sorted.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ticker} {r.short_strike}/{r.long_strike} exp {r.expiration}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.detailCard}>
                <h2 className={styles.chartTitle}>
                  P&amp;L Chart for {selected.ticker} {selected.short_strike}/{selected.long_strike}
                </h2>
                <SpreadChartPanel row={selected} />
              </div>
            </>
          )}
        </>
      )}

      {data._error && (
        <div className={styles.errorsNote}>
          <strong>Some spreads may be missing or incomplete:</strong>
          <p>{data._error}</p>
        </div>
      )}

      {ignoredPositions?.results?.length > 0 && (
        <div className={styles.errorsNote}>
          <strong>Ignored ({ignoredPositions.results.length}):</strong> manually hidden - clears
          automatically once the position actually closes, or un-ignore it now. Shared with the
          Positions page (naked puts and spreads use the same list).
          <ul className={styles.ignoredList}>
            {ignoredPositions.results.map((entry) => (
              <li key={entry.id}>
                {entry.ticker} ${Number(entry.strike).toFixed(2)}
                {entry.long_strike != null ? `/${Number(entry.long_strike).toFixed(2)}` : ''} exp {entry.expiration} x{entry.contracts}
                {' '}
                <button
                  className={styles.unignoreLink}
                  onClick={async () => { await unignorePosition(entry.id); refetch(); refetchIgnored(); }}
                >
                  Un-ignore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
