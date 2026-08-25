import { useEffect, useMemo, useState } from 'react';
import {
  getActiveCalendars, createCalendarPosition, closeCalendarPosition, deleteCalendarPosition,
} from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { evaluateCalendar, combineCurves, curveValueAt } from '../lib/calendarEval';
import { computeDTE } from '../lib/dte';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import IVShiftSlider from '../components/IVShiftSlider';
import CalendarEvalChart from '../components/CalendarEvalChart';
import tableStyles from '../components/Table.module.css';
import styles from './CalendarSpreadsPage.module.css';

// Reuses the standalone-evaluator pattern (lib/calendarEval.js,
// CalendarEvalChart.js) fed from this ALREADY-OPEN position's real
// strike/expirations/entry prices/live back-leg IV instead of a
// hand-typed hypothetical - "value at front expiration" curve, requires
// Black-Scholes (unlike BWB/vertical's pure intrinsic-value curves)
// since the back leg still carries time value at that point.
function CalendarChartPanel({ row, ivShiftPct }) {
  const result = evaluateCalendar({
    optionType: row.option_type,
    strike: row.strike,
    frontExpiration: row.front_expiration,
    backExpiration: row.back_expiration,
    netDebitEntryPerShare: row.net_debit_entry,
    contracts: row.contracts,
    currentSpot: row.spot_price,
    sigmaBack: row.back_iv,
    ivShiftPct,
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
        Curve Max Profit <strong className={tableStyles.positive}>{formatCurrency(result.curveMaxProfit)}</strong>
        {' · '}
        Curve Max Loss <strong className={tableStyles.negative}>{formatCurrency(result.curveMaxLoss)}</strong>
        {result.usedDefaultIv && (
          <> · <span className={styles.ivNote}>using default {Math.round(result.sigmaBack * 100)}% IV - no live quote available</span></>
        )}
      </p>
      <CalendarEvalChart
        curve={result.curve}
        strike={result.strike}
        currentSpot={result.currentSpot}
        spotPnl={result.spotPnl}
      />
    </div>
  );
}

// docs/calendarspreads.md's "double calendar" combined view - shown in
// ADDITION to (not instead of) the two individual single-calendar
// panels, only when two currently-open rows share a strategy_group tag.
function CombinedCalendarChartPanel({ rowA, rowB, ivShiftPct }) {
  const resultA = evaluateCalendar({
    optionType: rowA.option_type, strike: rowA.strike, frontExpiration: rowA.front_expiration,
    backExpiration: rowA.back_expiration, netDebitEntryPerShare: rowA.net_debit_entry,
    contracts: rowA.contracts, currentSpot: rowA.spot_price, sigmaBack: rowA.back_iv, ivShiftPct,
  });
  const resultB = evaluateCalendar({
    optionType: rowB.option_type, strike: rowB.strike, frontExpiration: rowB.front_expiration,
    backExpiration: rowB.back_expiration, netDebitEntryPerShare: rowB.net_debit_entry,
    contracts: rowB.contracts, currentSpot: rowB.spot_price, sigmaBack: rowB.back_iv, ivShiftPct,
  });

  if (!resultA.valid || !resultB.valid) {
    return (
      <div className={styles.chartPanel}>
        <p className={styles.chartError}>Can't chart the combined view: {[...resultA.errors, ...resultB.errors].join(' ')}</p>
      </div>
    );
  }

  const combined = combineCurves(resultA.curve, resultB.curve);
  const spot = rowA.spot_price || rowB.spot_price || null;
  const spotPnl = spot ? curveValueAt(combined, spot) : null;
  const combinedMaxProfit = Math.max(...combined.map((p) => p.pnl));
  const combinedMaxLoss = Math.min(...combined.map((p) => p.pnl));

  return (
    <div className={styles.chartPanel}>
      <p className={styles.chartSummary}>
        Combined Curve Max Profit <strong className={tableStyles.positive}>{formatCurrency(combinedMaxProfit)}</strong>
        {' · '}
        Combined Curve Max Loss <strong className={tableStyles.negative}>{formatCurrency(combinedMaxLoss)}</strong>
      </p>
      <CalendarEvalChart curve={combined} currentSpot={spot} spotPnl={spotPnl} title="Combined P&L at front expiration" />
    </div>
  );
}

// Manual entry only (no SnapTrade auto-detection - docs/calendarspreads.md).
// Puts or calls, short front-month / long back-month, same strike.
function AddCalendarForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    ticker: '', optionType: 'PUT', strike: '',
    entryDate: new Date().toISOString().slice(0, 10),
    frontExpiration: '', backExpiration: '', contracts: 1,
    frontEntryPrice: '', backEntryPrice: '', strategyGroup: '',
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
      await createCalendarPosition({
        ticker: form.ticker.trim().toUpperCase(),
        option_type: form.optionType,
        strike: Number(form.strike),
        front_expiration: form.frontExpiration,
        back_expiration: form.backExpiration,
        contracts: Number(form.contracts),
        front_entry_price: Number(form.frontEntryPrice),
        back_entry_price: Number(form.backEntryPrice),
        entry_date: form.entryDate,
        strategy_group: form.strategyGroup.trim() || undefined,
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
          Option Type
          <select value={form.optionType} onChange={(e) => update('optionType', e.target.value)} className={styles.formInputSmall}>
            <option value="PUT">PUT</option>
            <option value="CALL">CALL</option>
          </select>
        </label>
        <input placeholder="Strike" type="number" step="0.01" value={form.strike} onChange={(e) => update('strike', e.target.value)} required className={styles.formInputSmall} />
        <label className={styles.legLabel}>
          Date Opened
          <input type="date" value={form.entryDate} onChange={(e) => update('entryDate', e.target.value)} required className={styles.formInput} />
        </label>
        <input placeholder="Contracts" type="number" min="1" value={form.contracts} onChange={(e) => update('contracts', e.target.value)} required className={styles.formInputSmall} />
      </div>
      <div className={styles.addFormRow}>
        <label className={styles.legLabel}>
          Front (Short, Near-Term)
          <div className={styles.legInputs}>
            <input placeholder="Expiration" type="date" value={form.frontExpiration} onChange={(e) => update('frontExpiration', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Entry Credit" type="number" step="0.01" value={form.frontEntryPrice} onChange={(e) => update('frontEntryPrice', e.target.value)} required className={styles.formInputSmall} />
          </div>
        </label>
        <label className={styles.legLabel}>
          Back (Long, Far-Term)
          <div className={styles.legInputs}>
            <input placeholder="Expiration" type="date" value={form.backExpiration} onChange={(e) => update('backExpiration', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Entry Debit" type="number" step="0.01" value={form.backEntryPrice} onChange={(e) => update('backEntryPrice', e.target.value)} required className={styles.formInputSmall} />
          </div>
        </label>
        <label className={styles.legLabel}>
          Group (optional)
          <input placeholder="e.g. KWEB-2026-08-24" value={form.strategyGroup} onChange={(e) => update('strategyGroup', e.target.value)} className={styles.formInput} />
        </label>
      </div>
      <div className={styles.addFormRow}>
        <button type="submit" className={styles.saveButton} disabled={saving}>{saving ? 'Adding…' : 'Add Calendar'}</button>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      </div>
      {error && <div className={styles.formError}>{error}</div>}
    </form>
  );
}

// Pre-fills each leg's close-price field from this row's own live mid
// quotes, same pattern as BWB/Active Spreads' row actions.
function CalendarRowActions({ row, onClosed, onDeleted }) {
  const [mode, setMode] = useState(null); // null | 'closing' | 'deleting'
  const [saving, setSaving] = useState(false);
  const [frontClose, setFrontClose] = useState(row.front_mid != null ? row.front_mid.toFixed(2) : '');
  const [backClose, setBackClose] = useState(row.back_mid != null ? row.back_mid.toFixed(2) : '');
  const [error, setError] = useState(null);

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      await closeCalendarPosition(row.id, {
        front_close_price: Number(frontClose),
        back_close_price: Number(backClose),
      });
      onClosed();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Irreversible - for correcting a mis-entered trade, not a normal
  // exit. Use Close for that instead, which keeps the trade in your
  // history (P&L History, Package Win Rate KPIs).
  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await deleteCalendarPosition(row.id);
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
        <span className={styles.deleteWarning}>Permanently delete this calendar? This can't be undone.</span>
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
        Front Close
        <input type="number" step="0.01" value={frontClose} onChange={(e) => setFrontClose(e.target.value)} className={styles.formInputSmall} />
      </label>
      <label>
        Back Close
        <input type="number" step="0.01" value={backClose} onChange={(e) => setBackClose(e.target.value)} className={styles.formInputSmall} />
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
  { key: 'option_type', label: 'Type', sortable: true, getSortValue: (r) => r.option_type,
    render: (r) => r.option_type },
  { key: 'spot_price', label: 'Spot', sortable: true, getSortValue: (r) => r.spot_price,
    render: (r) => (r.spot_price != null ? r.spot_price.toFixed(2) : '—') },
  { key: 'strike', label: 'Strike', sortable: true, getSortValue: (r) => r.strike,
    render: (r) => r.strike?.toFixed(2) },
  { key: 'front_expiration', label: 'Front Exp', sortable: true, getSortValue: (r) => r.front_expiration,
    render: (r) => r.front_expiration },
  { key: 'dte', label: 'DTE', sortable: true, getSortValue: (r) => computeDTE(r.front_expiration),
    render: (r) => computeDTE(r.front_expiration) },
  { key: 'back_expiration', label: 'Back Exp', sortable: true, getSortValue: (r) => r.back_expiration,
    render: (r) => r.back_expiration },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.contracts,
    render: (r) => r.contracts },
  { key: 'net_debit_entry', label: 'Net Debit', sortable: true, getSortValue: (r) => r.net_debit_entry,
    render: (r) => (r.net_debit_entry != null ? r.net_debit_entry.toFixed(2) : '—') },
  { key: 'current_value', label: 'Current Value', sortable: true, getSortValue: (r) => r.current_value,
    render: (r) => (r.current_value != null ? r.current_value.toFixed(2) : '—') },
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
  { key: 'strategy_group', label: 'Group', sortable: true, getSortValue: (r) => r.strategy_group || '',
    render: (r) => r.strategy_group || '—' },
];

const NON_NUMERIC_COLUMNS = ['ticker', 'option_type', 'front_expiration', 'back_expiration', 'strategy_group'];

export default function CalendarSpreadsPage() {
  const { data, error, loading, refetch } = useApiData(getActiveCalendars, 'activeCalendars');
  const [showAddForm, setShowAddForm] = useState(false);
  const [ivShiftPct, setIvShiftPct] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  const calendars = data?.calendars || [];
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'calendarSpreadsTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    calendars,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue?.(row)
  );

  // Default the chart selector to the first row, same pattern as
  // BwbTradesPage/PositionsPage's own risk-curve selector.
  useEffect(() => {
    if (!selectedId && sorted.length > 0) {
      setSelectedId(sorted[0].id);
    }
  }, [sorted, selectedId]);

  const selected = sorted.find((r) => r.id === selectedId);

  // The selected row's "double calendar" partner, if any - another
  // currently-open row sharing the same non-null strategy_group.
  const combinedPartner = useMemo(() => {
    if (!selected?.strategy_group) return null;
    return sorted.find((r) => r.id !== selected.id && r.strategy_group === selected.strategy_group) || null;
  }, [selected, sorted]);

  if (loading && !data) return <LoadingView label="Loading calendar spreads" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Calendar Spreads" onRefresh={refetch} refreshing={loading} />

      <p className={styles.explainer}>
        Manually logged calendar spreads (short front-month/long back-month, same strike, puts or calls) -
        live P&amp;L against current market quotes. Not auto-detected from SnapTrade; log each trade here
        yourself. The chart below shows the position's theoretical value AT FRONT EXPIRATION, computed
        with Black-Scholes off the back leg's live IV (adjustable via the slider) - not a static
        at-expiration payoff the way BWB/vertical spreads have, since the back leg still carries time
        value at that point.
      </p>

      {error && <ErrorView message={error} onRetry={refetch} />}

      {!showAddForm ? (
        <button className={styles.addToggle} onClick={() => setShowAddForm(true)}>+ Add Calendar</button>
      ) : (
        <AddCalendarForm onCreated={() => { setShowAddForm(false); refetch(); }} onCancel={() => setShowAddForm(false)} />
      )}

      {sorted.length === 0 ? (
        <EmptyView message="No open calendar spreads logged." />
      ) : (
        <>
          <div className={styles.tableToolbar}>
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
                      <CalendarRowActions row={r} onClosed={refetch} onDeleted={refetch} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <>
              <div className={styles.selectorRow}>
                <label htmlFor="calendar-select" className={styles.selectorLabel}>
                  Chart - click a row above, or select here:
                </label>
                <select
                  id="calendar-select"
                  className={styles.selector}
                  value={selectedId || ''}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                >
                  {sorted.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ticker} {r.strike} {r.option_type} exp {r.front_expiration}/{r.back_expiration}
                    </option>
                  ))}
                </select>
              </div>

              <IVShiftSlider value={ivShiftPct} onChange={setIvShiftPct} />

              <div className={styles.detailCard}>
                <h2 className={styles.chartTitle}>
                  P&amp;L Chart for {selected.ticker} {selected.strike} {selected.option_type} ({selected.front_expiration}/{selected.back_expiration})
                </h2>
                <CalendarChartPanel row={selected} ivShiftPct={ivShiftPct} />
              </div>

              {combinedPartner && (
                <div className={styles.detailCard}>
                  <h2 className={styles.chartTitle}>
                    Combined: {selected.strategy_group}
                  </h2>
                  <CombinedCalendarChartPanel rowA={selected} rowB={combinedPartner} ivShiftPct={ivShiftPct} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {data._error && (
        <div className={styles.errorsNote}>
          <strong>Some calendars may be missing or incomplete:</strong>
          <p>{data._error}</p>
        </div>
      )}
    </div>
  );
}
