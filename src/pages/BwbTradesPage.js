import { Fragment, useMemo, useState } from 'react';
import { getActiveBwbs, createBwbPosition, closeBwbPosition, deleteBwbPosition, getLiquidityStatus } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { pctOfMaxProfitCaptured } from '../lib/profitCaptured';
import { evaluateBwb } from '../lib/bwbEval';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import LiquidityBadge from '../components/LiquidityBadge';
import ProfitTargetSlider from '../components/ProfitTargetSlider';
import BwbEvalChart from '../components/BwbEvalChart';
import tableStyles from '../components/Table.module.css';
import styles from './BwbTradesPage.module.css';

// Reuses the standalone BWB Evaluator's own math/chart (lib/bwbEval.js,
// BwbEvalChart.js) fed from this ALREADY-OPEN position's real strikes/
// credit/contracts instead of a hand-typed hypothetical - at-expiration
// payoff shape only (docs/tradesignalsv2.md-style "Tier 1" scope, 2026-08 -
// no Black-Scholes "theoretical today" line, since that needs live IV per
// leg, which isn't fetched anywhere in this page's own data today).
// net_cost is debit-positive (see position_log_service's convention) -
// evaluateBwb wants a positive net CREDIT, hence the sign flip below.
function BwbChartPanel({ row }) {
  const result = evaluateBwb({
    longLowStrike: row.long_low_strike,
    shortMidStrike: row.short_mid_strike,
    longHighStrike: row.long_high_strike,
    netCreditPerShare: -row.net_cost,
    contracts: row.contracts,
    currentSpot: row.spot_price,
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
        {result.isRiskFree ? (
          <>Guaranteed Floor <strong className={tableStyles.positive}>{formatCurrency(result.guaranteedProfit)}</strong></>
        ) : (
          <>Max Loss <strong className={tableStyles.negative}>-{formatCurrency(result.totalMaxLoss)}</strong></>
        )}
        {!result.isRiskFree && result.downsideBreakeven != null && (
          <> · Breakeven <strong>${result.downsideBreakeven.toFixed(2)}</strong></>
        )}
      </p>
      <BwbEvalChart
        curve={result.curve}
        longLowStrike={result.longLowStrike}
        shortMidStrike={result.shortMidStrike}
        longHighStrike={result.longHighStrike}
        currentSpot={result.currentSpot}
        spotPnl={result.spotPnl}
        totalMaxProfit={result.totalMaxProfit}
        totalMaxLoss={result.totalMaxLoss}
        guaranteedProfit={result.guaranteedProfit}
        downsideBreakeven={result.downsideBreakeven}
        isRiskFree={result.isRiskFree}
      />
    </div>
  );
}

const LIQUIDITY_RANK = { critical: 0, warning: 1, ok: 2 };

// Manual entry only (no SnapTrade auto-detection - docs/bwb_trades.md).
// Puts only: long wing / short middle x2 / long wing, same expiration.
function AddBwbForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    ticker: '', entryDate: new Date().toISOString().slice(0, 10), expiration: '', contracts: 1,
    longLowStrike: '', longLowPrice: '',
    shortMidStrike: '', shortMidPrice: '',
    longHighStrike: '', longHighPrice: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createBwbPosition({
        ticker: form.ticker.trim().toUpperCase(),
        entry_date: form.entryDate,
        expiration: form.expiration,
        contracts: Number(form.contracts),
        long_low: { strike: Number(form.longLowStrike), entry_price: Number(form.longLowPrice) },
        short_mid: { strike: Number(form.shortMidStrike), entry_price: Number(form.shortMidPrice) },
        long_high: { strike: Number(form.longHighStrike), entry_price: Number(form.longHighPrice) },
      });
      onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.addForm}>
      <div className={styles.addFormRow}>
        <input placeholder="Ticker" value={form.ticker} onChange={(e) => update('ticker', e.target.value)} required className={styles.formInput} />
        <label className={styles.legLabel}>
          Date Opened
          <input type="date" value={form.entryDate} onChange={(e) => update('entryDate', e.target.value)} required className={styles.formInput} />
        </label>
        <label className={styles.legLabel}>
          Expiration
          <input type="date" value={form.expiration} onChange={(e) => update('expiration', e.target.value)} required className={styles.formInput} />
        </label>
        <input placeholder="Contracts" type="number" min="1" value={form.contracts} onChange={(e) => update('contracts', e.target.value)} required className={styles.formInputSmall} />
      </div>
      <div className={styles.addFormRow}>
        <label className={styles.legLabel}>
          Long Wing (Low)
          <div className={styles.legInputs}>
            <input placeholder="Strike" type="number" step="0.01" value={form.longLowStrike} onChange={(e) => update('longLowStrike', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Entry Price" type="number" step="0.01" value={form.longLowPrice} onChange={(e) => update('longLowPrice', e.target.value)} required className={styles.formInputSmall} />
          </div>
        </label>
        <label className={styles.legLabel}>
          Short Middle (x2)
          <div className={styles.legInputs}>
            <input placeholder="Strike" type="number" step="0.01" value={form.shortMidStrike} onChange={(e) => update('shortMidStrike', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Entry Price" type="number" step="0.01" value={form.shortMidPrice} onChange={(e) => update('shortMidPrice', e.target.value)} required className={styles.formInputSmall} />
          </div>
        </label>
        <label className={styles.legLabel}>
          Long Wing (High)
          <div className={styles.legInputs}>
            <input placeholder="Strike" type="number" step="0.01" value={form.longHighStrike} onChange={(e) => update('longHighStrike', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Entry Price" type="number" step="0.01" value={form.longHighPrice} onChange={(e) => update('longHighPrice', e.target.value)} required className={styles.formInputSmall} />
          </div>
        </label>
      </div>
      <div className={styles.addFormRow}>
        <button type="submit" className={styles.saveButton} disabled={saving}>{saving ? 'Adding…' : 'Add BWB'}</button>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      </div>
      {error && <div className={styles.formError}>{error}</div>}
    </form>
  );
}

// Pre-fills each leg's close-price field from this row's own live mid
// quotes (already fetched for Current Net Value) - a reasonable starting
// point, overwritable with the real fill price. Same pattern as Active
// Spreads' SpreadRowActions, just 3 legs instead of 2.
function BwbRowActions({ row, onClosed, onDeleted }) {
  const [mode, setMode] = useState(null); // null | 'closing' | 'deleting'
  const [saving, setSaving] = useState(false);
  const [longLowClose, setLongLowClose] = useState(row.long_low_mid != null ? row.long_low_mid.toFixed(2) : '');
  const [shortMidClose, setShortMidClose] = useState(row.short_mid_mid != null ? row.short_mid_mid.toFixed(2) : '');
  const [longHighClose, setLongHighClose] = useState(row.long_high_mid != null ? row.long_high_mid.toFixed(2) : '');
  const [error, setError] = useState(null);

  const legId = (role) => row.bwb_legs?.find((l) => l.leg_role === role)?.id;

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      await closeBwbPosition(row.id, {
        legs: [
          { id: legId('long_low'), leg_role: 'long_low', close_price: Number(longLowClose) },
          { id: legId('short_mid'), leg_role: 'short_mid', close_price: Number(shortMidClose) },
          { id: legId('long_high'), leg_role: 'long_high', close_price: Number(longHighClose) },
        ],
      });
      onClosed();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Irreversible - for correcting a mis-entered trade (e.g. a strike that
  // turns out not to be a real listed one), not for a normal exit. Use
  // Close for that instead, which keeps the trade in your history.
  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await deleteBwbPosition(row.id);
      onDeleted();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (mode === null) {
    return (
      <div className={styles.rowActions}>
        <button className={styles.actionButtonClose} onClick={() => setMode('closing')}>Close</button>
        <button className={styles.deleteButton} onClick={() => setMode('deleting')}>Delete</button>
      </div>
    );
  }

  if (mode === 'deleting') {
    return (
      <div className={styles.inlinePanel}>
        <span className={styles.deleteWarning}>Permanently delete this BWB? This can't be undone.</span>
        <button className={styles.deleteButton} onClick={handleDelete} disabled={saving}>
          {saving ? 'Deleting…' : 'Confirm Delete'}
        </button>
        <button className={styles.cancelButton} onClick={() => setMode(null)}>Cancel</button>
        {error && <div className={styles.formError}>{error}</div>}
      </div>
    );
  }

  return (
    <div className={styles.inlinePanel}>
      <label>
        Low Close
        <input type="number" step="0.01" value={longLowClose} onChange={(e) => setLongLowClose(e.target.value)} className={styles.formInputSmall} />
      </label>
      <label>
        Mid Close
        <input type="number" step="0.01" value={shortMidClose} onChange={(e) => setShortMidClose(e.target.value)} className={styles.formInputSmall} />
      </label>
      <label>
        High Close
        <input type="number" step="0.01" value={longHighClose} onChange={(e) => setLongHighClose(e.target.value)} className={styles.formInputSmall} />
      </label>
      <button className={styles.actionButtonClose} onClick={handleClose} disabled={saving}>
        {saving ? 'Closing…' : 'Confirm Close'}
      </button>
      <button className={styles.cancelButton} onClick={() => setMode(null)}>Cancel</button>
      {error && <div className={styles.formError}>{error}</div>}
    </div>
  );
}

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'spot_price', label: 'Spot', sortable: true, getSortValue: (r) => r.spot_price,
    render: (r) => (r.spot_price != null ? r.spot_price.toFixed(2) : '—') },
  { key: 'long_low_strike', label: 'Long Wing (Low)', sortable: true, getSortValue: (r) => r.long_low_strike,
    render: (r) => r.long_low_strike?.toFixed(2) },
  { key: 'short_mid_strike', label: 'Short Middle', sortable: true, getSortValue: (r) => r.short_mid_strike,
    render: (r) => r.short_mid_strike?.toFixed(2) },
  { key: 'long_high_strike', label: 'Long Wing (High)', sortable: true, getSortValue: (r) => r.long_high_strike,
    render: (r) => r.long_high_strike?.toFixed(2) },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration,
    render: (r) => r.expiration },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.contracts,
    render: (r) => r.contracts },
  { key: 'net_cost', label: 'Net Entry', sortable: true, getSortValue: (r) => r.net_cost,
    render: (r) => (r.net_cost != null ? (r.net_cost <= 0 ? `${(-r.net_cost).toFixed(2)} credit` : `${r.net_cost.toFixed(2)} debit`) : '—') },
  { key: 'current_net_value', label: 'Current Net Value', sortable: true, getSortValue: (r) => r.current_net_value,
    render: (r) => (r.current_net_value != null ? r.current_net_value.toFixed(2) : '—') },
  { key: 'live_pnl', label: 'Live P&L', sortable: true, getSortValue: (r) => r.live_pnl,
    render: (r) => (
      r.live_pnl != null
        ? <span className={r.live_pnl >= 0 ? tableStyles.positive : tableStyles.negative}>{formatCurrency(r.live_pnl)}</span>
        : '—'
    ) },
  { key: 'max_profit', label: 'Max Profit', sortable: true, getSortValue: (r) => r.max_profit,
    render: (r) => (r.max_profit != null ? formatCurrency(r.max_profit) : '—') },
  { key: 'max_loss', label: 'Max Loss', sortable: true, getSortValue: (r) => r.max_loss,
    render: (r) => (r.max_loss != null ? formatCurrency(r.max_loss) : '—') },
  { key: 'breakevens', label: 'Breakevens', sortable: false,
    render: (r) => {
      const parts = [r.lower_breakeven, r.upper_breakeven].filter((v) => v != null).map((v) => v.toFixed(2));
      return parts.length ? parts.join(' / ') : '—';
    } },
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
  { key: 'liquidity', label: 'Liquidity', sortable: true,
    getSortValue: (r) => LIQUIDITY_RANK[r.liquidity?.severity] ?? 3,
    render: (r) => <LiquidityBadge snapshot={r.liquidity} /> },
];

const NON_NUMERIC_COLUMNS = ['ticker', 'expiration', 'breakevens', 'liquidity'];

export default function BwbTradesPage() {
  const { data, error, loading, refetch } = useApiData(getActiveBwbs, 'activeBwbs');
  const { data: liquidityStatus } = useApiData(getLiquidityStatus, 'liquidityStatus');
  const [showAddForm, setShowAddForm] = useState(false);
  const [profitTarget, setProfitTarget] = useState(80);
  const [chartRowId, setChartRowId] = useState(null);

  // Keyed by position_id (docs/liquiddecay.md) - see ActiveSpreadsPage's
  // identical comment for why this is position_id, not strategy_group.
  const liquidityByPosition = useMemo(() => {
    const map = {};
    (liquidityStatus?.results || []).forEach((snapshot) => {
      map[snapshot.position_id] = snapshot;
    });
    return map;
  }, [liquidityStatus]);

  const bwbs = useMemo(
    () => (data?.bwbs || []).map((r) => {
      const pctCaptured = pctOfMaxProfitCaptured(r.live_pnl, r.max_profit);
      return {
        ...r,
        liquidity: liquidityByPosition[r.id],
        pctCaptured,
        hitProfitTarget: pctCaptured != null && pctCaptured >= profitTarget,
      };
    }),
    [data, liquidityByPosition, profitTarget]
  );
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'bwbTradesTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    bwbs,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue?.(row)
  );

  if (loading && !data) return <LoadingView label="Loading BWB trades" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="BWB Trades" onRefresh={refetch} refreshing={loading} />

      <p className={styles.explainer}>
        Manually logged broken wing butterflies (puts only) - live P&amp;L against current market quotes,
        plus the max profit/max loss/breakeven figures fixed at entry. Not auto-detected from E*TRADE;
        log each trade here yourself.
      </p>

      {error && <ErrorView message={error} onRetry={refetch} />}

      {!showAddForm ? (
        <button className={styles.addToggle} onClick={() => setShowAddForm(true)}>+ Add BWB</button>
      ) : (
        <AddBwbForm onCreated={() => { setShowAddForm(false); refetch(); }} onCancel={() => setShowAddForm(false)} />
      )}

      {sorted.length === 0 ? (
        <EmptyView message="No open broken wing butterflies logged." />
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
                  <Fragment key={r.id}>
                    <tr>
                      {visibleColumns.map((col) => (
                        <td key={col.key} className={NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'}>
                          {col.render(r)}
                        </td>
                      ))}
                      <td className={styles.actionsCell}>
                        <button
                          className={styles.chartToggle}
                          onClick={() => setChartRowId(chartRowId === r.id ? null : r.id)}
                        >
                          {chartRowId === r.id ? 'Hide Chart' : 'Chart'}
                        </button>
                        <BwbRowActions row={r} onClosed={refetch} onDeleted={refetch} />
                      </td>
                    </tr>
                    {chartRowId === r.id && (
                      <tr>
                        <td colSpan={visibleColumns.length + 1}>
                          <BwbChartPanel row={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data._error && (
        <div className={styles.errorsNote}>
          <strong>Some BWBs may be missing or incomplete:</strong>
          <p>{data._error}</p>
        </div>
      )}
    </div>
  );
}
