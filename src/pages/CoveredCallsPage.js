import { useEffect, useMemo, useState } from 'react';
import { getActiveCoveredCalls, createCoveredCallPosition, closeCoveredCallPosition, deleteCoveredCallPosition } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { computeStatus } from '../lib/coveredCallSignal';
import { evaluateCoveredCall } from '../lib/coveredCallEval';
import { computeDTE } from '../lib/dte';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import StatusBadge from '../components/StatusBadge';
import ProfitTargetSlider from '../components/ProfitTargetSlider';
import CoveredCallEvalChart from '../components/CoveredCallEvalChart';
import tableStyles from '../components/Table.module.css';
import styles from './CoveredCallsPage.module.css';

// Reuses this already-open position's real strike/premium/cost-basis to
// chart the at-expiration payoff, same idea as BwbTradesPage's
// BwbChartPanel - no Black-Scholes "theoretical today" line, just the
// expiration curve.
function CoveredCallChartPanel({ row }) {
  const result = evaluateCoveredCall({
    strike: row.strike,
    shareCostBasis: row.share_cost_basis,
    entryPricePerShare: row.entry_price,
    shareQuantity: row.share_quantity,
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
        Max Profit <strong className={tableStyles.positive}>{formatCurrency(result.maxProfit)}</strong>
        {' · '}
        Breakeven <strong>${result.breakeven.toFixed(2)}</strong>
      </p>
      <CoveredCallEvalChart
        curve={result.curve}
        strike={result.strike}
        breakeven={result.breakeven}
        currentSpot={result.currentSpot}
        spotPnl={result.spotPnl}
        maxProfit={result.maxProfit}
      />
    </div>
  );
}

const STATUS_RANK = { 'take-profit': 0, assignment: 1, 'roll-hold': 2 };

// Manual entry only (no SnapTrade auto-pairing - docs/coveredcalls.md).
// One short call leg + one stock leg per row.
function AddCoveredCallForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    ticker: '', entryDate: new Date().toISOString().slice(0, 10), expiration: '', contracts: 1,
    strike: '', entryPrice: '',
    shareQuantity: '', shareCostBasis: '', shareEntryDate: new Date().toISOString().slice(0, 10),
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
      await createCoveredCallPosition({
        ticker: form.ticker.trim().toUpperCase(),
        entry_date: form.entryDate,
        expiration: form.expiration,
        contracts: Number(form.contracts),
        strike: Number(form.strike),
        entry_price: Number(form.entryPrice),
        share_quantity: Number(form.shareQuantity),
        share_cost_basis: Number(form.shareCostBasis),
        share_entry_date: form.shareEntryDate,
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
          Call Sold Date
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
          Short Call
          <div className={styles.legInputs}>
            <input placeholder="Strike" type="number" step="0.01" value={form.strike} onChange={(e) => update('strike', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Premium" type="number" step="0.01" value={form.entryPrice} onChange={(e) => update('entryPrice', e.target.value)} required className={styles.formInputSmall} />
          </div>
        </label>
        <label className={styles.legLabel}>
          Shares
          <div className={styles.legInputs}>
            <input placeholder="Quantity" type="number" step="1" value={form.shareQuantity} onChange={(e) => update('shareQuantity', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Cost Basis" type="number" step="0.01" value={form.shareCostBasis} onChange={(e) => update('shareCostBasis', e.target.value)} required className={styles.formInputSmall} />
          </div>
        </label>
        <label className={styles.legLabel}>
          Shares Acquired
          <input type="date" value={form.shareEntryDate} onChange={(e) => update('shareEntryDate', e.target.value)} required className={styles.formInput} />
        </label>
      </div>
      <div className={styles.addFormRow}>
        <button type="submit" className={styles.saveButton} disabled={saving}>{saving ? 'Adding…' : 'Add Covered Call'}</button>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      </div>
      {error && <div className={styles.formError}>{error}</div>}
    </form>
  );
}

function CoveredCallRowActions({ row, onClosed, onDeleted }) {
  const [mode, setMode] = useState(null); // null | 'closing' | 'deleting'
  const [saving, setSaving] = useState(false);
  const [closeReason, setCloseReason] = useState('bought_to_close');
  const [closedPrice, setClosedPrice] = useState(row.call_mid != null ? row.call_mid.toFixed(2) : '');
  const [error, setError] = useState(null);

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      const payload = { close_reason: closeReason };
      if (closeReason === 'bought_to_close') {
        payload.closed_price = Number(closedPrice);
      }
      await closeCoveredCallPosition(row.id, payload);
      onClosed();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Irreversible - for correcting a mis-entered trade, not for a normal
  // exit. Use Close for that instead, which keeps the trade in your history.
  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await deleteCoveredCallPosition(row.id);
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
        <span className={styles.deleteWarning}>Permanently delete this covered call? This can't be undone.</span>
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
        Reason
        <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} className={styles.formSelect}>
          <option value="bought_to_close">Bought to Close</option>
          <option value="expired_worthless">Expired Worthless</option>
          <option value="called_away">Called Away</option>
        </select>
      </label>
      {closeReason === 'bought_to_close' && (
        <label>
          Close Price
          <input type="number" step="0.01" value={closedPrice} onChange={(e) => setClosedPrice(e.target.value)} className={styles.formInputSmall} />
        </label>
      )}
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
  { key: 'strike', label: 'Call Strike', sortable: true, getSortValue: (r) => r.strike,
    render: (r) => r.strike?.toFixed(2) },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration,
    render: (r) => r.expiration },
  { key: 'dte', label: 'DTE', sortable: true, getSortValue: (r) => computeDTE(r.expiration),
    render: (r) => computeDTE(r.expiration) },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.contracts,
    render: (r) => r.contracts },
  { key: 'share_quantity', label: 'Shares', sortable: true, getSortValue: (r) => r.share_quantity,
    render: (r) => r.share_quantity },
  { key: 'share_cost_basis', label: 'Cost Basis', sortable: true, getSortValue: (r) => r.share_cost_basis,
    render: (r) => (r.share_cost_basis != null ? r.share_cost_basis.toFixed(2) : '—') },
  { key: 'entry_price', label: 'Call Premium', sortable: true, getSortValue: (r) => r.entry_price,
    render: (r) => (r.entry_price != null ? r.entry_price.toFixed(2) : '—') },
  { key: 'call_mid', label: 'Call Mid', sortable: true, getSortValue: (r) => r.call_mid,
    render: (r) => (r.call_mid != null ? r.call_mid.toFixed(2) : '—') },
  { key: 'option_pl', label: 'Option P&L', sortable: true, getSortValue: (r) => r.option_pl,
    render: (r) => (
      r.option_pl != null
        ? <span className={r.option_pl >= 0 ? tableStyles.positive : tableStyles.negative}>{formatCurrency(r.option_pl)}</span>
        : '—'
    ) },
  { key: 'share_pl', label: 'Share P&L', sortable: true, getSortValue: (r) => r.share_pl,
    render: (r) => (
      r.share_pl != null
        ? <span className={r.share_pl >= 0 ? tableStyles.positive : tableStyles.negative}>{formatCurrency(r.share_pl)}</span>
        : '—'
    ) },
  { key: 'total_pl', label: 'Total P&L', sortable: true, getSortValue: (r) => r.total_pl,
    render: (r) => (
      r.total_pl != null
        ? <span className={r.total_pl >= 0 ? tableStyles.positive : tableStyles.negative}>{formatCurrency(r.total_pl)}</span>
        : '—'
    ) },
  { key: 'days_held', label: 'Days Held', sortable: true, getSortValue: (r) => r.days_held,
    render: (r) => r.days_held ?? '—' },
  { key: 'status', label: 'Status', sortable: true,
    getSortValue: (r) => STATUS_RANK[r.status?.tone] ?? 3,
    render: (r) => (r.status ? <StatusBadge status={r.status} /> : '—') },
];

const NON_NUMERIC_COLUMNS = ['ticker', 'expiration', 'status'];

export default function CoveredCallsPage() {
  const { data, error, loading, refetch } = useApiData(getActiveCoveredCalls, 'activeCoveredCalls');
  const [showAddForm, setShowAddForm] = useState(false);
  const [profitTarget, setProfitTarget] = useState(80);
  const [selectedId, setSelectedId] = useState(null);

  const coveredCalls = useMemo(
    () => (data?.covered_calls || []).map((r) => ({
      ...r,
      status: (r.call_mid != null && r.spot_price != null && r.dte != null)
        ? computeStatus(r.entry_price, r.call_mid, r.spot_price, r.strike, r.dte, profitTarget)
        : null,
    })),
    [data, profitTarget]
  );
  // docs/coveredcallupdate.md (LOCKED): this summary bar is an aggregate,
  // not the per-position table below - it sums Option P&L only, excluding
  // Share P&L (stock-price risk, not options performance). The table's
  // own Option/Share/Total P&L columns are the one place all three stay
  // visible side by side.
  const totalLivePnl = useMemo(
    () => coveredCalls.reduce((sum, r) => sum + (r.option_pl || 0), 0),
    [coveredCalls]
  );
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'coveredCallsTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    coveredCalls,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue?.(row)
  );

  useEffect(() => {
    if (!selectedId && sorted.length > 0) {
      setSelectedId(sorted[0].id);
    }
  }, [sorted, selectedId]);

  const selected = sorted.find((r) => r.id === selectedId);

  if (loading && !data) return <LoadingView label="Loading covered calls" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Covered Calls" onRefresh={refetch} refreshing={loading} />

      <p className={styles.explainer}>
        Manually logged covered calls (long shares + short call against them) - live P&amp;L against current
        market quotes, split into the option leg and the share leg. Not auto-detected from SnapTrade;
        log each trade here yourself.
      </p>

      {error && <ErrorView message={error} onRetry={refetch} />}

      <SummaryBar
        items={[
          {
            label: 'Current Profit/Loss',
            value: totalLivePnl,
            sub: 'Live option P&L for open covered calls only (excludes Share P&L - see table below for the per-position split)',
            subTone: totalLivePnl >= 0 ? 'positive' : undefined,
          },
        ]}
      />

      {!showAddForm ? (
        <button className={styles.addToggle} onClick={() => setShowAddForm(true)}>+ Add Covered Call</button>
      ) : (
        <AddCoveredCallForm onCreated={() => { setShowAddForm(false); refetch(); }} onCancel={() => setShowAddForm(false)} />
      )}

      {sorted.length === 0 ? (
        <EmptyView message="No open covered calls logged." />
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
                      <CoveredCallRowActions row={r} onClosed={refetch} onDeleted={refetch} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <>
              <div className={styles.selectorRow}>
                <label htmlFor="covered-call-select" className={styles.selectorLabel}>
                  Chart - click a row above, or select here:
                </label>
                <select
                  id="covered-call-select"
                  className={styles.selector}
                  value={selectedId || ''}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                >
                  {sorted.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ticker} {r.strike} exp {r.expiration}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.detailCard}>
                <h2 className={styles.chartTitle}>
                  P&amp;L Chart for {selected.ticker} {selected.strike}
                </h2>
                <CoveredCallChartPanel row={selected} />
              </div>
            </>
          )}
        </>
      )}

      {data._error && (
        <div className={styles.errorsNote}>
          <strong>Some covered calls may be missing or incomplete:</strong>
          <p>{data._error}</p>
        </div>
      )}
    </div>
  );
}
