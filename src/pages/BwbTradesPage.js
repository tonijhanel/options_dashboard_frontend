import { useState } from 'react';
import { getActiveBwbs, createBwbPosition, closeBwbPosition, deleteBwbPosition } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import tableStyles from '../components/Table.module.css';
import styles from './BwbTradesPage.module.css';

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
];

const NON_NUMERIC_COLUMNS = ['ticker', 'expiration', 'breakevens'];

export default function BwbTradesPage() {
  const { data, error, loading, refetch } = useApiData(getActiveBwbs, 'activeBwbs');
  const [showAddForm, setShowAddForm] = useState(false);

  const bwbs = data?.bwbs || [];
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
                      <BwbRowActions row={r} onClosed={refetch} onDeleted={refetch} />
                    </td>
                  </tr>
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
