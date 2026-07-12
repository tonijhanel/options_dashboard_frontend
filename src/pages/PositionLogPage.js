import { useState, useEffect, useCallback } from 'react';
import { getPositionLog, createPositionLogEntry, updatePositionLogEntry } from '../api/client';
import { useSortableData } from '../lib/useSortableData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import { formatDate } from '../lib/formatDate';
import tableStyles from '../components/Table.module.css';
import styles from './PositionLogPage.module.css';

const CLOSE_REASON_SUGGESTIONS = ['assigned', 'bought_back', 'rolled', 'expired'];

const OPEN_COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker },
  { key: 'position_type', label: 'Type', sortable: true, getSortValue: (r) => r.position_type },
  { key: 'strike', label: 'Strike', sortable: true, getSortValue: (r) => r.short_strike ?? r.strike },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.contracts },
  { key: 'entry_price', label: 'Entry Price', sortable: true, getSortValue: (r) => r.entry_price },
  { key: 'collateral_required', label: 'Collateral', sortable: true, getSortValue: (r) => r.collateral_required },
  { key: 'roc', label: 'ROC', sortable: true, getSortValue: (r) => r.roc },
  { key: 'annualized_roc', label: 'Annualized ROC', sortable: true, getSortValue: (r) => r.annualized_roc },
  { key: 'entry_date', label: 'Entry Date', sortable: true, getSortValue: (r) => r.entry_date },
  { key: 'strategy_group', label: 'Strategy', sortable: true, getSortValue: (r) => r.strategy_group || '' },
  { key: 'source', label: 'Source', sortable: true, getSortValue: (r) => r.source },
];

const CLOSED_COLUMNS = [
  ...OPEN_COLUMNS,
  { key: 'closed_date', label: 'Closed Date', sortable: true, getSortValue: (r) => r.closed_date },
  { key: 'closed_price', label: 'Closed Price', sortable: true, getSortValue: (r) => r.closed_price },
  { key: 'realized_pnl', label: 'P&L', sortable: true, getSortValue: (r) => r.realized_pnl },
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
  const [positionType, setPositionType] = useState(row.position_type || 'naked_put');
  const [shortStrike, setShortStrike] = useState(row.short_strike ?? '');
  const [longStrike, setLongStrike] = useState(row.long_strike ?? '');
  // Per-leg prices - the real source of truth for a spread's true net
  // premium/P&L, as opposed to entry_price/closed_price alone (which
  // only ever mirrored the short leg's raw amount, not a genuine net
  // premium across both legs).
  const [shortEntryPrice, setShortEntryPrice] = useState(row.short_entry_price ?? '');
  const [longEntryPrice, setLongEntryPrice] = useState(row.long_entry_price ?? '');
  const [shortClosePrice, setShortClosePrice] = useState(row.short_close_price ?? '');
  const [longClosePrice, setLongClosePrice] = useState(row.long_close_price ?? '');
  const [strategyGroup, setStrategyGroup] = useState(row.strategy_group ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSaveEdit() {
    setSaving(true);
    setError(null);
    try {
      const spreadNetEntry = shortEntryPrice !== '' && longEntryPrice !== ''
        ? Number(shortEntryPrice) - Number(longEntryPrice)
        : undefined;
      const spreadNetClose = shortClosePrice !== '' && longClosePrice !== ''
        ? Number(shortClosePrice) - Number(longClosePrice)
        : undefined;

      const payload = {
        // For a spread, entry_price is no longer directly editable - it's
        // auto-computed as the net per-share credit (short - long) from
        // the two real fields above, so anything still reading this
        // field directly sees a sane net value instead of the old raw
        // short-leg-only amount.
        entry_price: positionType === 'vertical_spread'
          ? spreadNetEntry
          : (entryPrice !== '' ? Number(entryPrice) : undefined),
        entry_date: entryDate || undefined,
        position_type: positionType,
        // Only send strikes/per-leg prices when reclassifying AS a spread
        // - a naked_put row has no meaningful short/long strike or leg
        // prices, so don't overwrite with blanks if the type wasn't
        // actually changed to spread.
        ...(positionType === 'vertical_spread'
          ? {
              short_strike: shortStrike !== '' ? Number(shortStrike) : undefined,
              long_strike: longStrike !== '' ? Number(longStrike) : undefined,
              short_entry_price: shortEntryPrice !== '' ? Number(shortEntryPrice) : undefined,
              long_entry_price: longEntryPrice !== '' ? Number(longEntryPrice) : undefined,
              strategy_group: strategyGroup || undefined,
            }
          : {}),
      };
      // For an already-closed row, "Edit" also lets you fill in or correct
      // the closed_price/close_reason after the fact - e.g. adding a note
      // you didn't have time to enter when you closed it yesterday.
      if (isClosed) {
        payload.closed_price = positionType === 'vertical_spread'
          ? spreadNetClose
          : (closedPrice !== '' ? Number(closedPrice) : undefined);
        payload.close_reason = closeReason || undefined;
        if (positionType === 'vertical_spread') {
          payload.short_close_price = shortClosePrice !== '' ? Number(shortClosePrice) : undefined;
          payload.long_close_price = longClosePrice !== '' ? Number(longClosePrice) : undefined;
        }
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
      const spreadNetClose = shortClosePrice !== '' && longClosePrice !== ''
        ? Number(shortClosePrice) - Number(longClosePrice)
        : undefined;
      await updatePositionLogEntry(row.id, {
        status: 'closed',
        closed_price: positionType === 'vertical_spread'
          ? spreadNetClose
          : (closedPrice !== '' ? Number(closedPrice) : undefined),
        close_reason: closeReason || undefined,
        ...(positionType === 'vertical_spread'
          ? {
              short_close_price: shortClosePrice !== '' ? Number(shortClosePrice) : undefined,
              long_close_price: longClosePrice !== '' ? Number(longClosePrice) : undefined,
            }
          : {}),
      });
      setMode(null);
      onUpdated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen() {
    setSaving(true);
    setError(null);
    try {
      // Corrects a position that was wrongly auto-closed - e.g. a call
      // spread the old detection logic couldn't see at all (fixed today),
      // making the diff think it had disappeared when it was actually
      // still open the whole time. Clears every close-related field
      // rather than just flipping status, so the row doesn't linger with
      // stale closed_date/close_reason data alongside status='open'.
      await updatePositionLogEntry(row.id, {
        status: 'open',
        closed_date: null,
        closed_price: null,
        close_reason: null,
        short_close_price: null,
        long_close_price: null,
      });
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
        {isClosed && (
          <button className={styles.actionButton} onClick={handleReopen} disabled={saving}>
            {saving ? 'Reopening…' : 'Reopen'}
          </button>
        )}
        {error && <div className={styles.formError}>{error}</div>}
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className={styles.inlinePanel}>
        {positionType !== 'vertical_spread' && (
          <label>
            Entry Price
            <input type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className={styles.formInputSmall} />
          </label>
        )}
        <label>
          Entry Date
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={styles.formInputSmall} />
        </label>
        <label>
          Type
          <select value={positionType} onChange={(e) => setPositionType(e.target.value)} className={styles.formInputSmall}>
            <option value="naked_put">Naked Put</option>
            <option value="vertical_spread">Spread</option>
          </select>
        </label>
        {positionType === 'vertical_spread' && (
          <>
            <label>
              Short Strike
              <input type="number" step="0.01" value={shortStrike} onChange={(e) => setShortStrike(e.target.value)} className={styles.formInputSmall} />
            </label>
            <label>
              Long Strike
              <input type="number" step="0.01" value={longStrike} onChange={(e) => setLongStrike(e.target.value)} className={styles.formInputSmall} />
            </label>
            <label>
              Short Entry Price
              <input type="number" step="0.01" value={shortEntryPrice} onChange={(e) => setShortEntryPrice(e.target.value)} className={styles.formInputSmall} />
            </label>
            <label>
              Long Entry Price
              <input type="number" step="0.01" value={longEntryPrice} onChange={(e) => setLongEntryPrice(e.target.value)} className={styles.formInputSmall} />
            </label>
            <label>
              Strategy Group
              <input
                type="text"
                value={strategyGroup}
                onChange={(e) => setStrategyGroup(e.target.value)}
                className={styles.formInput}
                placeholder="e.g. SPXW 2026-07-16 IC - shared label for a related iron condor half"
              />
            </label>
          </>
        )}
        {isClosed && (
          <>
            {positionType !== 'vertical_spread' && (
              <label>
                Closed Price
                <input type="number" step="0.01" value={closedPrice} onChange={(e) => setClosedPrice(e.target.value)} className={styles.formInputSmall} />
              </label>
            )}
            {positionType === 'vertical_spread' && (
              <>
                <label>
                  Short Close Price
                  <input type="number" step="0.01" value={shortClosePrice} onChange={(e) => setShortClosePrice(e.target.value)} className={styles.formInputSmall} />
                </label>
                <label>
                  Long Close Price
                  <input type="number" step="0.01" value={longClosePrice} onChange={(e) => setLongClosePrice(e.target.value)} className={styles.formInputSmall} />
                </label>
              </>
            )}
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
      {positionType !== 'vertical_spread' && (
        <label>
          Closed Price
          <input type="number" step="0.01" value={closedPrice} onChange={(e) => setClosedPrice(e.target.value)} className={styles.formInputSmall} />
        </label>
      )}
      {positionType === 'vertical_spread' && (
        <>
          <label>
            Short Close Price
            <input type="number" step="0.01" value={shortClosePrice} onChange={(e) => setShortClosePrice(e.target.value)} className={styles.formInputSmall} />
          </label>
          <label>
            Long Close Price
            <input type="number" step="0.01" value={longClosePrice} onChange={(e) => setLongClosePrice(e.target.value)} className={styles.formInputSmall} />
          </label>
        </>
      )}
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
  // Column visibility is keyed separately for open vs. closed, since the
  // two views have genuinely different columns (closed adds three more) -
  // Source is hidden by default since it's low day-to-day value (mostly
  // just "auto" vs "manual"); anyone can re-show it via the picker.
  const { hidden, toggle, visibleColumns } = useColumnVisibility(
    columns, `positionLogTable.${statusView}`, ['source']
  );
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
        <div className={styles.columnPickerSlot}>
          <ColumnPicker columns={columns} hidden={hidden} onToggle={toggle} />
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
                {statusView === 'open' && <th>Days Held</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id}>
                  <td className={styles.ticker}>{row.ticker}</td>
                  {!hidden.has('position_type') && (
                    <td>{row.position_type === 'vertical_spread' ? 'Spread' : 'Naked Put'}</td>
                  )}
                  {!hidden.has('strike') && (
                    <td className="num">
                      {row.position_type === 'vertical_spread'
                        ? `${row.short_strike}/${row.long_strike}`
                        : row.strike?.toFixed(2)}
                    </td>
                  )}
                  {!hidden.has('expiration') && <td>{row.expiration}</td>}
                  {!hidden.has('contracts') && <td className="num">{row.contracts}</td>}
                  {!hidden.has('entry_price') && (
                    <td className="num">
                      {row.position_type === 'vertical_spread' && row.short_entry_price != null && row.long_entry_price != null
                        ? (row.short_entry_price - row.long_entry_price).toFixed(2)
                        : row.entry_price !== null && row.entry_price !== undefined ? row.entry_price.toFixed(2) : '—'}
                    </td>
                  )}
                  {!hidden.has('collateral_required') && (
                    <td className="num">
                      {row.collateral_required !== null && row.collateral_required !== undefined
                        ? `$${row.collateral_required.toLocaleString()}`
                        : '—'}
                    </td>
                  )}
                  {!hidden.has('roc') && (
                    <td className="num">
                      {row.roc !== null && row.roc !== undefined ? `${row.roc.toFixed(1)}%` : '—'}
                    </td>
                  )}
                  {!hidden.has('annualized_roc') && (
                    <td className="num">
                      {row.annualized_roc !== null && row.annualized_roc !== undefined
                        ? `${row.annualized_roc.toFixed(1)}%`
                        : '—'}
                    </td>
                  )}
                  {!hidden.has('entry_date') && (
                    <td>{formatDate(row.entry_date)}</td>
                  )}
                  {!hidden.has('strategy_group') && (
                    <td className={row.strategy_group ? '' : tableStyles.muted}>{row.strategy_group || '—'}</td>
                  )}
                  {!hidden.has('source') && <td className={tableStyles.muted}>{row.source}</td>}
                  {statusView === 'closed' && (
                    <>
                      {!hidden.has('closed_date') && (
                        <td>{formatDate(row.closed_date)}</td>
                      )}
                      {!hidden.has('closed_price') && (
                        <td className="num">{row.closed_price !== null && row.closed_price !== undefined ? row.closed_price.toFixed(2) : '—'}</td>
                      )}
                      {!hidden.has('realized_pnl') && (
                        <td className={`num ${row.realized_pnl == null ? tableStyles.muted : row.realized_pnl >= 0 ? styles.positive : styles.negative}`}>
                          {row.realized_pnl != null ? `$${row.realized_pnl.toLocaleString()}` : 'missing price'}
                        </td>
                      )}
                      {!hidden.has('close_reason') && (
                        <td className={row.close_reason ? '' : tableStyles.muted}>{row.close_reason || 'not recorded'}</td>
                      )}
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