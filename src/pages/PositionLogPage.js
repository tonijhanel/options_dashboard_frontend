import { useState, useEffect, useCallback } from 'react';
import { getPositionLog, createPositionLogEntry, updatePositionLogEntry } from '../api/client';
import { useSortableData } from '../lib/useSortableData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import tableStyles from '../components/Table.module.css';
import styles from './PositionLogPage.module.css';

const CLOSE_REASON_SUGGESTIONS = ['assigned', 'bought_back', 'rolled', 'expired'];

const OPEN_COLUMNS = [
  { key: 'ticker', label: 'Ticker', sortable: true, getSortValue: (r) => r.ticker },
  { key: 'position_type', label: 'Type', sortable: true, getSortValue: (r) => r.position_type },
  { key: 'strike', label: 'Strike', sortable: true, getSortValue: (r) => r.short_strike ?? r.strike },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.contracts },
  { key: 'entry_price', label: 'Entry Price', sortable: true, getSortValue: (r) => r.entry_price },
  { key: 'entry_date', label: 'Entry Date', sortable: true, getSortValue: (r) => r.entry_date },
  { key: 'source', label: 'Source', sortable: true, getSortValue: (r) => r.source },
];

const CLOSED_COLUMNS = [
  ...OPEN_COLUMNS,
  { key: 'closed_date', label: 'Closed Date', sortable: true, getSortValue: (r) => r.closed_date },
  { key: 'closed_price', label: 'Closed Price', sortable: true, getSortValue: (r) => r.closed_price },
  { key: 'close_reason', label: 'Close Reason', sortable: true, getSortValue: (r) => r.close_reason || '' },
];

function daysHeld(entryDate) {
  if (!entryDate) return '—';
  const days = Math.floor((Date.now() - new Date(entryDate).getTime()) / (1000 * 60 * 60 * 24));
  return days;
}

function AddPositionForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ ticker: '', strike: '', expiration: '', contracts: 1, entry_price: '' });
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
      await createPositionLogEntry({
        ticker: form.ticker.trim().toUpperCase(),
        strike: Number(form.strike),
        expiration: form.expiration,
        contracts: Number(form.contracts),
        entry_price: form.entry_price ? Number(form.entry_price) : undefined,
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
      <input placeholder="Ticker" value={form.ticker} onChange={(e) => update('ticker', e.target.value)} required className={styles.formInput} />
      <input placeholder="Strike" type="number" step="0.01" value={form.strike} onChange={(e) => update('strike', e.target.value)} required className={styles.formInput} />
      <input placeholder="Expiration (YYYY-MM-DD)" type="date" value={form.expiration} onChange={(e) => update('expiration', e.target.value)} required className={styles.formInput} />
      <input placeholder="Contracts" type="number" value={form.contracts} onChange={(e) => update('contracts', e.target.value)} required className={styles.formInputSmall} />
      <input placeholder="Entry Price" type="number" step="0.01" value={form.entry_price} onChange={(e) => update('entry_price', e.target.value)} className={styles.formInput} />
      <button type="submit" className={styles.saveButton} disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
      <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      {error && <div className={styles.formError}>{error}</div>}
    </form>
  );
}

function RowActions({ row, onUpdated, isClosed }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'close'
  const [entryPrice, setEntryPrice] = useState(row.entry_price ?? '');
  const [entryDate, setEntryDate] = useState(row.entry_date ? row.entry_date.slice(0, 10) : '');
  const [closedPrice, setClosedPrice] = useState(row.closed_price ?? '');
  const [closeReason, setCloseReason] = useState(row.close_reason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSaveEdit() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        entry_price: entryPrice !== '' ? Number(entryPrice) : undefined,
        entry_date: entryDate || undefined,
      };
      // For an already-closed row, "Edit" also lets you fill in or correct
      // the closed_price/close_reason after the fact - e.g. adding a note
      // you didn't have time to enter when you closed it yesterday.
      if (isClosed) {
        payload.closed_price = closedPrice !== '' ? Number(closedPrice) : undefined;
        payload.close_reason = closeReason || undefined;
      }
      await updatePositionLogEntry(row.id, payload);
      setMode(null);
      onUpdated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      await updatePositionLogEntry(row.id, {
        status: 'closed',
        closed_price: closedPrice !== '' ? Number(closedPrice) : undefined,
        close_reason: closeReason || undefined,
      });
      setMode(null);
      onUpdated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (mode === null) {
    return (
      <div className={styles.rowActions}>
        <button className={styles.actionButton} onClick={() => setMode('edit')}>Edit</button>
        {!isClosed && <button className={styles.actionButtonClose} onClick={() => setMode('close')}>Close</button>}
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className={styles.inlinePanel}>
        <label>
          Entry Price
          <input type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className={styles.formInputSmall} />
        </label>
        <label>
          Entry Date
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={styles.formInputSmall} />
        </label>
        {isClosed && (
          <>
            <label>
              Closed Price
              <input type="number" step="0.01" value={closedPrice} onChange={(e) => setClosedPrice(e.target.value)} className={styles.formInputSmall} />
            </label>
            <label>
              Close Reason
              <input
                list="close-reason-suggestions"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                className={styles.formInput}
                placeholder="assigned, bought_back, rolled, expired..."
              />
              <datalist id="close-reason-suggestions">
                {CLOSE_REASON_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </label>
          </>
        )}
        <button className={styles.saveButton} onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className={styles.cancelButton} onClick={() => setMode(null)}>Cancel</button>
        {error && <div className={styles.formError}>{error}</div>}
      </div>
    );
  }

  return (
    <div className={styles.inlinePanel}>
      <label>
        Closed Price
        <input type="number" step="0.01" value={closedPrice} onChange={(e) => setClosedPrice(e.target.value)} className={styles.formInputSmall} />
      </label>
      <label>
        Close Reason
        <input
          list="close-reason-suggestions"
          value={closeReason}
          onChange={(e) => setCloseReason(e.target.value)}
          className={styles.formInput}
          placeholder="assigned, bought_back, rolled, expired..."
        />
        <datalist id="close-reason-suggestions">
          {CLOSE_REASON_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>
      <button className={styles.actionButtonClose} onClick={handleClose} disabled={saving}>{saving ? 'Closing…' : 'Confirm Close'}</button>
      <button className={styles.cancelButton} onClick={() => setMode(null)}>Cancel</button>
      {error && <div className={styles.formError}>{error}</div>}
    </div>
  );
}

export default function PositionLogPage() {
  const [statusView, setStatusView] = useState('open');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchData = useCallback(async (status) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPositionLog(status);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(statusView);
  }, [statusView, fetchData]);

  const positions = data?.positions || [];
  const columns = statusView === 'closed' ? CLOSED_COLUMNS : OPEN_COLUMNS;
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    positions,
    (row, key) => columns.find((c) => c.key === key).getSortValue(row)
  );

  if (loading && !data) return <LoadingView label="Loading position log" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => fetchData(statusView)} />;

  return (
    <div>
      <PageHeader title="Position Log" onRefresh={() => fetchData(statusView)} refreshing={loading} />

      {error && <ErrorView message={error} onRetry={() => fetchData(statusView)} />}

      <p className={styles.explainer}>
        Rows here are auto-logged whenever a position opens or closes in /positions; use the actions
        below to correct an entry date/price, or close something out manually with the real reason.
      </p>

      <div className={styles.toolbar}>
        <div className={styles.viewToggle}>
          <button
            className={statusView === 'open' ? styles.toggleActive : styles.toggle}
            onClick={() => setStatusView('open')}
          >
            Open
          </button>
          <button
            className={statusView === 'closed' ? styles.toggleActive : styles.toggle}
            onClick={() => setStatusView('closed')}
          >
            Closed
          </button>
        </div>
      </div>

      {statusView === 'open' && (
        !showAddForm ? (
          <button className={styles.addToggle} onClick={() => setShowAddForm(true)}>+ Add Position</button>
        ) : (
          <AddPositionForm onCreated={() => { setShowAddForm(false); fetchData('open'); }} onCancel={() => setShowAddForm(false)} />
        )
      )}

      {sorted.length === 0 ? (
        <EmptyView message={statusView === 'open' ? 'No open positions logged.' : 'No closed positions yet.'} />
      ) : (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                {columns.map((col) => (
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
                {statusView === 'open' && <th>Days Held</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id}>
                  <td className={styles.ticker}>{row.ticker}</td>
                  <td>{row.position_type === 'vertical_spread' ? 'Spread' : 'Naked Put'}</td>
                  <td className="num">
                    {row.position_type === 'vertical_spread'
                      ? `${row.short_strike}/${row.long_strike}`
                      : row.strike?.toFixed(2)}
                  </td>
                  <td>{row.expiration}</td>
                  <td className="num">{row.contracts}</td>
                  <td className="num">{row.entry_price !== null && row.entry_price !== undefined ? row.entry_price.toFixed(2) : '—'}</td>
                  <td>{row.entry_date ? new Date(row.entry_date).toLocaleDateString() : '—'}</td>
                  <td className={tableStyles.muted}>{row.source}</td>
                  {statusView === 'closed' && (
                    <>
                      <td>{row.closed_date ? new Date(row.closed_date).toLocaleDateString() : '—'}</td>
                      <td className="num">{row.closed_price !== null && row.closed_price !== undefined ? row.closed_price.toFixed(2) : '—'}</td>
                      <td className={row.close_reason ? '' : tableStyles.muted}>{row.close_reason || 'not recorded'}</td>
                    </>
                  )}
                  {statusView === 'open' && (
                    <td className="num">{daysHeld(row.entry_date)}</td>
                  )}
                  <td>
                    <RowActions row={row} onUpdated={() => fetchData(statusView)} isClosed={statusView === 'closed'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}