import { useMemo, useState } from 'react';
import { getPositionLog, createManualTrade, updatePositionLogEntry, deleteManualTrade } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { formatDate } from '../lib/formatDate';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import tableStyles from '../components/Table.module.css';
import styles from './ManualTradesPage.module.css';

const fetchManualTrades = () => getPositionLog('closed');

// Standalone trades not tracked through this dashboard's structured
// positions (no option chain, no live pricing) - just enough to keep a
// complete P&L record. Counts toward P&L History and win-rate KPIs
// (services/position_log_service.py's manual_trade branches), unlike
// every other manually-entered strategy this session, which are
// created OPEN and closed later - a manual trade is entered already
// fully closed, in one shot, since it represents something that
// already happened.
function AddManualTradeForm({ onCreated, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    ticker: '', tradeType: '', entryDate: today, closeDate: today, profitLoss: '',
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
      await createManualTrade({
        ticker: form.ticker.trim().toUpperCase(),
        trade_type: form.tradeType.trim() || undefined,
        entry_date: form.entryDate,
        close_date: form.closeDate,
        profit_loss: Number(form.profitLoss),
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
        <input placeholder="Trade Type (e.g. swing, day trade)" value={form.tradeType} onChange={(e) => update('tradeType', e.target.value)} className={styles.formInputWide} />
        <label className={styles.legLabel}>
          Entry Date
          <input type="date" value={form.entryDate} onChange={(e) => update('entryDate', e.target.value)} required className={styles.formInput} />
        </label>
        <label className={styles.legLabel}>
          Close Date
          <input type="date" value={form.closeDate} onChange={(e) => update('closeDate', e.target.value)} required className={styles.formInput} />
        </label>
        <input placeholder="Profit/Loss" type="number" step="0.01" value={form.profitLoss} onChange={(e) => update('profitLoss', e.target.value)} required className={styles.formInputSmall} />
      </div>
      <div className={styles.addFormRow}>
        <button type="submit" className={styles.saveButton} disabled={saving}>{saving ? 'Adding…' : 'Add Trade'}</button>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      </div>
      {error && <div className={styles.formError}>{error}</div>}
    </form>
  );
}

function ManualTradeRowActions({ row, onSaved, onDeleted }) {
  const [mode, setMode] = useState(null); // null | 'editing' | 'deleting'
  const [saving, setSaving] = useState(false);
  const [ticker, setTicker] = useState(row.ticker || '');
  const [tradeType, setTradeType] = useState(row.trade_type || '');
  const [entryDate, setEntryDate] = useState(row.entry_date ? row.entry_date.slice(0, 10) : '');
  const [closeDate, setCloseDate] = useState(row.closed_date ? row.closed_date.slice(0, 10) : '');
  const [profitLoss, setProfitLoss] = useState(row.manual_profit_loss ?? '');
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updatePositionLogEntry(row.id, {
        ticker: ticker.trim().toUpperCase(),
        trade_type: tradeType.trim() || null,
        entry_date: entryDate,
        closed_date: closeDate,
        manual_profit_loss: Number(profitLoss),
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await deleteManualTrade(row.id);
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
        <button className={styles.actionButtonClose} onClick={() => setMode('editing')}>Edit</button>
        <button className={styles.deleteButton} onClick={() => setMode('deleting')}>Delete</button>
      </div>
    );
  }

  if (mode === 'deleting') {
    return (
      <div className={styles.inlinePanel}>
        <span className={styles.deleteWarning}>Permanently delete this trade? This can't be undone.</span>
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
      <input value={ticker} onChange={(e) => setTicker(e.target.value)} className={styles.formInputSmall} />
      <input value={tradeType} onChange={(e) => setTradeType(e.target.value)} placeholder="Trade Type" className={styles.formInputWide} />
      <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={styles.formInput} />
      <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className={styles.formInput} />
      <input type="number" step="0.01" value={profitLoss} onChange={(e) => setProfitLoss(e.target.value)} className={styles.formInputSmall} />
      <button className={styles.actionButtonClose} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button className={styles.cancelButton} onClick={() => setMode(null)}>Cancel</button>
      {error && <div className={styles.formError}>{error}</div>}
    </div>
  );
}

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'trade_type', label: 'Trade Type', sortable: true, getSortValue: (r) => r.trade_type || '',
    render: (r) => r.trade_type || '—' },
  { key: 'entry_date', label: 'Entry Date', sortable: true, getSortValue: (r) => r.entry_date,
    render: (r) => formatDate(r.entry_date) },
  { key: 'closed_date', label: 'Close Date', sortable: true, getSortValue: (r) => r.closed_date,
    render: (r) => formatDate(r.closed_date) },
  { key: 'manual_profit_loss', label: 'Profit/Loss', sortable: true, getSortValue: (r) => r.manual_profit_loss,
    render: (r) => (
      r.manual_profit_loss != null
        ? <span className={r.manual_profit_loss >= 0 ? tableStyles.positive : tableStyles.negative}>{formatCurrency(r.manual_profit_loss)}</span>
        : '—'
    ) },
];

const NON_NUMERIC_COLUMNS = ['ticker', 'trade_type', 'entry_date', 'closed_date'];

export default function ManualTradesPage() {
  const { data, error, loading, refetch } = useApiData(fetchManualTrades, 'manualTradesLog');
  const [showAddForm, setShowAddForm] = useState(false);

  const manualTrades = useMemo(
    () => (data?.positions || []).filter((p) => p.position_type === 'manual_trade'),
    [data]
  );
  const totalPl = useMemo(
    () => manualTrades.reduce((sum, r) => sum + (r.manual_profit_loss || 0), 0),
    [manualTrades]
  );
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'manualTradesTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    manualTrades,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue?.(row)
  );

  if (loading && !data) return <LoadingView label="Loading manual trades" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Manual Trades" onRefresh={refetch} refreshing={loading} />

      <p className={styles.explainer}>
        Trades not tracked through this dashboard's structured positions - logged here just to keep a
        complete P&amp;L record. Counted in P&amp;L History and win-rate KPIs alongside every other
        strategy.
      </p>

      {error && <ErrorView message={error} onRetry={refetch} />}

      <SummaryBar
        items={[
          {
            label: 'Total Profit/Loss',
            value: totalPl,
            sub: `${manualTrades.length} trade(s) logged`,
            subTone: totalPl >= 0 ? 'positive' : undefined,
          },
        ]}
      />

      {!showAddForm ? (
        <button className={styles.addToggle} onClick={() => setShowAddForm(true)}>+ Add Trade</button>
      ) : (
        <AddManualTradeForm onCreated={() => { setShowAddForm(false); refetch(); }} onCancel={() => setShowAddForm(false)} />
      )}

      {sorted.length === 0 ? (
        <EmptyView message="No manual trades logged." />
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
                  <tr key={r.id}>
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'}>
                        {col.render(r)}
                      </td>
                    ))}
                    <td className={styles.actionsCell}>
                      <ManualTradeRowActions row={r} onSaved={refetch} onDeleted={refetch} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
