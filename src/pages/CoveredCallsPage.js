import { useEffect, useMemo, useState } from 'react';
import { getActiveCoveredCalls, getCoveredCallLots, createCoveredCallPosition, closeCoveredCallPosition, deleteCoveredCallPosition, updatePositionLogEntry, getPositionLog } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { computeStatus } from '../lib/coveredCallSignal';
import { evaluateCoveredCall } from '../lib/coveredCallEval';
import { computeDTE } from '../lib/dte';
import { formatDate } from '../lib/formatDate';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import StatusBadge from '../components/StatusBadge';
import ProfitTargetSlider from '../components/ProfitTargetSlider';
import CoveredCallEvalChart from '../components/CoveredCallEvalChart';
import CoveredCallKpiBanner from '../components/CoveredCallKpiBanner';
import tableStyles from '../components/Table.module.css';
import styles from './CoveredCallsPage.module.css';

const fetchClosedCoveredCalls = () => getPositionLog('closed');

// docs/coveredcallupdate.md (LOCKED) still holds here - Option/Share/Total
// P&L stay visible side by side, same as the open-positions table above,
// since this IS "the per-position covered calls table," just scoped to
// closed rows. GET /position-log already attaches option_pl/share_pl/
// total_pl for closed covered_call rows (app.py's position_log_list), so
// no new backend endpoint is needed - just filter the generic closed log
// down to this position_type.
const CLOSED_COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'strike', label: 'Call Strike', sortable: true, getSortValue: (r) => r.strike,
    render: (r) => r.strike?.toFixed(2) },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration,
    render: (r) => r.expiration },
  { key: 'share_quantity', label: 'Shares', sortable: true, getSortValue: (r) => r.share_quantity,
    render: (r) => r.share_quantity },
  { key: 'share_cost_basis', label: 'Cost Basis', sortable: true, getSortValue: (r) => r.share_cost_basis,
    render: (r) => (r.share_cost_basis != null ? r.share_cost_basis.toFixed(2) : '—') },
  { key: 'entry_price', label: 'Call Premium', sortable: true, getSortValue: (r) => r.entry_price,
    render: (r) => (r.entry_price != null ? r.entry_price.toFixed(2) : '—') },
  { key: 'close_reason', label: 'Close Reason', sortable: true, getSortValue: (r) => r.close_reason || '',
    render: (r) => r.close_reason || 'not recorded' },
  { key: 'closed_date', label: 'Closed Date', sortable: true, getSortValue: (r) => r.closed_date,
    render: (r) => formatDate(r.closed_date) },
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
];

const CLOSED_NON_NUMERIC_COLUMNS = ['ticker', 'expiration', 'close_reason', 'closed_date'];

function ClosedCoveredCallsSection() {
  const { data, error, loading, refetch } = useApiData(fetchClosedCoveredCalls, 'closedCoveredCallsLog');
  const closedCoveredCalls = useMemo(
    () => (data?.positions || []).filter((p) => p.position_type === 'covered_call'),
    [data]
  );
  const { hidden, toggle, visibleColumns } = useColumnVisibility(CLOSED_COLUMNS, 'closedCoveredCallsTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    closedCoveredCalls,
    (row, key) => CLOSED_COLUMNS.find((c) => c.key === key).getSortValue?.(row)
  );

  if (loading && !data) return <LoadingView label="Loading closed covered calls" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;

  return (
    <div className={styles.detailCard}>
      <div className={styles.tableToolbar}>
        <h2 className={styles.chartTitle}>Recently Closed</h2>
        <ColumnPicker columns={CLOSED_COLUMNS} hidden={hidden} onToggle={toggle} />
      </div>
      {sorted.length === 0 ? (
        <EmptyView message="No closed covered calls yet." />
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
              {sorted.map((r) => (
                <tr key={r.id}>
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={CLOSED_NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'}>
                      {col.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Reuses this already-open position's real strike/premium/cost-basis to
// chart the at-expiration payoff, same idea as BwbTradesPage's
// BwbChartPanel - no Black-Scholes "theoretical today" line, just the
// expiration curve.
function CoveredCallChartPanel({ row }) {
  const result = evaluateCoveredCall({
    strike: row.strike,
    // Prefer the freshly-recomputed lot cost basis (accounts for every
    // prior cycle's premium on this share lot) over the row's own stored
    // snapshot - falls back to share_cost_basis for a row with no lot
    // tracking set up yet (see CoveredCallRowActions' "Set Up Lot" action).
    shareCostBasis: row.true_net_cost_basis ?? row.share_cost_basis,
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
const PACKAGE_STATUS_RANK = { harvest: 0, 'assignment-lock': 1, defend: 2, 'hold-to-expire': 3, 'active-theta': 4 };

// Manual entry only (no SnapTrade auto-pairing - docs/coveredcalls.md).
// One short call leg + one stock leg per row. Two modes:
//   - New Lot: a fresh share purchase (or the first time backfilling an
//     existing one into lot tracking) - takes Original Purchase Price
//     and an optional lump "premium already collected" for backfilling,
//     and computes share_cost_basis server-side rather than asking for
//     it directly (see api/app.py's covered_call_positions_create).
//   - Continue Lot: selling a new call against shares already tracked
//     from a prior cycle (GET /covered-call-lots - shares held, no
//     currently-open call) - only the new call's own fields are needed;
//     ticker/shares/cost basis all come from the lot itself.
function AddCoveredCallForm({ onCreated, onCancel }) {
  const { data: lotsData } = useApiData(getCoveredCallLots, 'coveredCallLots');
  const lots = lotsData?.lots || [];
  const today = new Date().toISOString().slice(0, 10);
  const [lotMode, setLotMode] = useState('new'); // 'new' | 'continue'
  const [strategyGroup, setStrategyGroup] = useState('');
  const [form, setForm] = useState({
    ticker: '', entryDate: today, expiration: '', contracts: 1,
    strike: '', entryPrice: '',
    shareQuantity: '', originalPurchasePrice: '', startingPremiumCollected: '0', shareEntryDate: today,
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
      const payload = {
        entry_date: form.entryDate,
        expiration: form.expiration,
        contracts: Number(form.contracts),
        strike: Number(form.strike),
        entry_price: Number(form.entryPrice),
      };
      if (lotMode === 'continue') {
        if (!strategyGroup) throw new Error('Select a lot to continue.');
        payload.strategy_group = strategyGroup;
      } else {
        payload.ticker = form.ticker.trim().toUpperCase();
        payload.share_quantity = Number(form.shareQuantity);
        payload.original_purchase_price = Number(form.originalPurchasePrice);
        payload.starting_premium_collected = Number(form.startingPremiumCollected || 0);
        payload.share_entry_date = form.shareEntryDate;
      }
      await createCoveredCallPosition(payload);
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
        <label className={styles.legLabel}>
          <input type="radio" name="lotMode" checked={lotMode === 'new'} onChange={() => setLotMode('new')} />
          {' '}New Lot (new shares, or backfilling an existing position)
        </label>
        <label className={styles.legLabel}>
          <input type="radio" name="lotMode" checked={lotMode === 'continue'} onChange={() => setLotMode('continue')} disabled={lots.length === 0} />
          {' '}Continue Lot (sell a new call against shares you already hold){lots.length === 0 && ' - none available'}
        </label>
      </div>

      {lotMode === 'continue' ? (
        <div className={styles.addFormRow}>
          <label className={styles.legLabel}>
            Lot
            <select value={strategyGroup} onChange={(e) => setStrategyGroup(e.target.value)} required className={styles.formInput}>
              <option value="">Select a lot…</option>
              {lots.map((lot) => (
                <option key={lot.strategy_group} value={lot.strategy_group}>
                  {lot.ticker} - {lot.share_quantity} sh - True Net Cost Basis ${lot.true_net_cost_basis?.toFixed(2)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className={styles.addFormRow}>
          <input placeholder="Ticker" value={form.ticker} onChange={(e) => update('ticker', e.target.value)} required className={styles.formInput} />
          <label className={styles.legLabel}>
            Shares
            <div className={styles.legInputs}>
              <input placeholder="Quantity" type="number" step="1" value={form.shareQuantity} onChange={(e) => update('shareQuantity', e.target.value)} required className={styles.formInputSmall} />
              <input placeholder="Original Purchase Price" type="number" step="0.01" value={form.originalPurchasePrice} onChange={(e) => update('originalPurchasePrice', e.target.value)} required className={styles.formInputSmall} />
            </div>
          </label>
          <label className={styles.legLabel}>
            Shares Acquired
            <input type="date" value={form.shareEntryDate} onChange={(e) => update('shareEntryDate', e.target.value)} required className={styles.formInput} />
          </label>
          <label className={styles.legLabel}>
            Premium Already Collected
            <input placeholder="0 if brand new" type="number" step="0.01" value={form.startingPremiumCollected} onChange={(e) => update('startingPremiumCollected', e.target.value)} className={styles.formInputSmall} />
          </label>
        </div>
      )}

      <div className={styles.addFormRow}>
        <label className={styles.legLabel}>
          Call Sold Date
          <input type="date" value={form.entryDate} onChange={(e) => update('entryDate', e.target.value)} required className={styles.formInput} />
        </label>
        <label className={styles.legLabel}>
          Expiration
          <input type="date" value={form.expiration} onChange={(e) => update('expiration', e.target.value)} required className={styles.formInput} />
        </label>
        <input placeholder="Contracts" type="number" min="1" value={form.contracts} onChange={(e) => update('contracts', e.target.value)} required className={styles.formInputSmall} />
        <label className={styles.legLabel}>
          Short Call
          <div className={styles.legInputs}>
            <input placeholder="Strike" type="number" step="0.01" value={form.strike} onChange={(e) => update('strike', e.target.value)} required className={styles.formInputSmall} />
            <input placeholder="Premium" type="number" step="0.01" value={form.entryPrice} onChange={(e) => update('entryPrice', e.target.value)} required className={styles.formInputSmall} />
          </div>
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

// Backfill action for a covered call logged before lot tracking existed
// (no strategy_group) - attaches it to a new lot by setting Original
// Purchase Price + a lump "premium collected so far," same New Lot
// inputs as AddCoveredCallForm, via the generic PATCH /position-log/<id>
// route rather than a dedicated endpoint (this is a plain field edit on
// an already-open row, not a create or a close).
function SetUpLotForm({ row, onSaved, onCancel }) {
  const [originalPurchasePrice, setOriginalPurchasePrice] = useState(row.share_cost_basis != null ? row.share_cost_basis.toFixed(2) : '');
  const [startingPremiumCollected, setStartingPremiumCollected] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const originalPrice = Number(originalPurchasePrice);
      const startingPremium = Number(startingPremiumCollected || 0);
      const shareEntryDate = row.share_entry_date ? row.share_entry_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      await updatePositionLogEntry(row.id, {
        strategy_group: `${row.ticker}-${shareEntryDate}`,
        original_purchase_price: originalPrice,
        starting_premium_collected: startingPremium,
        share_cost_basis: Math.round((originalPrice - startingPremium) * 10000) / 10000,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.inlinePanel}>
      <label>
        Original Purchase Price
        <input type="number" step="0.01" value={originalPurchasePrice} onChange={(e) => setOriginalPurchasePrice(e.target.value)} className={styles.formInputSmall} />
      </label>
      <label>
        Premium Already Collected
        <input type="number" step="0.01" value={startingPremiumCollected} onChange={(e) => setStartingPremiumCollected(e.target.value)} className={styles.formInputSmall} />
      </label>
      <button className={styles.actionButtonClose} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      {error && <div className={styles.formError}>{error}</div>}
    </div>
  );
}

// Corrects an EXISTING lot's header fields (Original Purchase Price /
// Premium Collected So Far) - unlike SetUpLotForm above, this never
// touches strategy_group (already set, and other cycles in the lot may
// already reference it). Added after a real incident: SetUpLotForm's
// button disappears once a lot exists, so a data-entry mistake on the
// first try had no in-app way to correct - only a direct database edit,
// which left share_cost_basis out of sync with the (separately
// corrected) original_purchase_price/starting_premium_collected. This
// recomputes and saves all three together so they can't drift apart.
function EditLotForm({ row, onSaved, onCancel }) {
  const [originalPurchasePrice, setOriginalPurchasePrice] = useState(row.original_purchase_price != null ? row.original_purchase_price.toFixed(2) : '');
  const [startingPremiumCollected, setStartingPremiumCollected] = useState(row.starting_premium_collected != null ? row.starting_premium_collected.toFixed(2) : '0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const originalPrice = Number(originalPurchasePrice);
      const startingPremium = Number(startingPremiumCollected || 0);
      await updatePositionLogEntry(row.id, {
        original_purchase_price: originalPrice,
        starting_premium_collected: startingPremium,
        share_cost_basis: Math.round((originalPrice - startingPremium) * 10000) / 10000,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.inlinePanel}>
      <label>
        Original Purchase Price
        <input type="number" step="0.01" value={originalPurchasePrice} onChange={(e) => setOriginalPurchasePrice(e.target.value)} className={styles.formInputSmall} />
      </label>
      <label>
        Premium Collected So Far
        <input type="number" step="0.01" value={startingPremiumCollected} onChange={(e) => setStartingPremiumCollected(e.target.value)} className={styles.formInputSmall} />
      </label>
      <button className={styles.actionButtonClose} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
      {error && <div className={styles.formError}>{error}</div>}
    </div>
  );
}

// Entered as a PER-SHARE sale price (like the option leg's Close Price),
// not a pre-computed dollar total - the app does the (price - cost basis)
// * quantity math, same as the Called Away case already did implicitly
// via the strike. Defaults to the strike for Called Away, since a real
// assignment always sells at exactly the strike; blank/optional
// otherwise (the shares may not have been sold at all).
function computeSharePl(row, salePrice) {
  if (salePrice === '' || row.share_cost_basis == null || row.share_quantity == null) return null;
  return (Number(salePrice) - row.share_cost_basis) * row.share_quantity;
}

function CoveredCallRowActions({ row, onClosed, onDeleted, onLotSaved }) {
  const [mode, setMode] = useState(null); // null | 'closing' | 'deleting' | 'lot-setup' | 'lot-edit'
  const [saving, setSaving] = useState(false);
  const [closeReason, setCloseReason] = useState('bought_to_close');
  const [closedPrice, setClosedPrice] = useState(row.call_mid != null ? row.call_mid.toFixed(2) : '');
  // Starts blank - shares aren't necessarily sold at all (the common
  // case: option closes, shares stay held). Only auto-fills a default
  // when switching TO called_away, where the sale price (the strike) is
  // actually knowable; for bought_to_close/expired_worthless it stays
  // optional/blank unless the user separately sold the shares themselves
  // and wants to record that alongside the option close.
  const [sharePrice, setSharePrice] = useState('');
  const [error, setError] = useState(null);

  function handleReasonChange(newReason) {
    setCloseReason(newReason);
    if (newReason === 'called_away' && sharePrice === '' && row.strike != null) {
      setSharePrice(row.strike.toFixed(2));
    }
  }

  const sharePl = computeSharePl(row, sharePrice);

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      const payload = { close_reason: closeReason };
      if (closeReason === 'bought_to_close') {
        payload.closed_price = Number(closedPrice);
      }
      if (sharePl != null) {
        payload.share_pl_override = Math.round(sharePl * 100) / 100;
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

  if (mode === 'lot-setup') {
    return <SetUpLotForm row={row} onSaved={() => { setMode(null); onLotSaved(); }} onCancel={() => setMode(null)} />;
  }

  if (mode === 'lot-edit') {
    return <EditLotForm row={row} onSaved={() => { setMode(null); onLotSaved(); }} onCancel={() => setMode(null)} />;
  }

  if (mode === null) {
    return (
      <div className={styles.rowActions}>
        <button className={styles.actionButtonClose} onClick={() => setMode('closing')}>Close</button>
        {!row.strategy_group && (
          <button className={styles.actionButtonClose} onClick={() => setMode('lot-setup')}>Set Up Lot</button>
        )}
        {row.strategy_group && row.original_purchase_price != null && (
          <button className={styles.actionButtonClose} onClick={() => setMode('lot-edit')}>Edit Lot</button>
        )}
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
        <select value={closeReason} onChange={(e) => handleReasonChange(e.target.value)} className={styles.formSelect}>
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
      <label>
        Share Sale Price{closeReason !== 'called_away' && ' (optional)'}
        <input
          type="number" step="0.01" value={sharePrice}
          onChange={(e) => setSharePrice(e.target.value)}
          placeholder={closeReason !== 'called_away' ? 'only if shares were also sold' : ''}
          className={styles.formInputSmall}
        />
        {sharePl != null && (
          <span className={sharePl >= 0 ? tableStyles.positive : tableStyles.negative}>
            {' '}= {formatCurrency(sharePl)}
          </span>
        )}
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
  { key: 'original_purchase_price', label: 'Original Purchase Price', sortable: true, getSortValue: (r) => r.original_purchase_price,
    render: (r) => (r.original_purchase_price != null ? r.original_purchase_price.toFixed(2) : '—') },
  { key: 'cumulative_premium_collected', label: 'Cumulative Premium', sortable: true, getSortValue: (r) => r.cumulative_premium_collected,
    render: (r) => (r.cumulative_premium_collected != null ? formatCurrency(r.cumulative_premium_collected * (r.share_quantity || 0)) : '—') },
  { key: 'true_net_cost_basis', label: 'True Net Cost Basis', sortable: true,
    getSortValue: (r) => r.true_net_cost_basis ?? r.share_cost_basis,
    render: (r) => {
      const basis = r.true_net_cost_basis ?? r.share_cost_basis;
      return basis != null ? basis.toFixed(2) : '—';
    } },
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
  { key: 'share_pl', label: 'Floating P&L', sortable: true, getSortValue: (r) => r.share_pl,
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
  // docs/coveredcalltable.md Package Valuation metrics
  { key: 'max_profit', label: 'Net Profit if Assigned', sortable: true, getSortValue: (r) => r.max_profit,
    render: (r) => (r.max_profit != null ? formatCurrency(r.max_profit) : '—') },
  { key: 'pct_max_captured', label: '% Max Captured', sortable: true, getSortValue: (r) => r.pct_max_captured,
    render: (r) => (r.pct_max_captured != null ? `${r.pct_max_captured.toFixed(1)}%` : '—') },
  { key: 'extrinsic_value_left', label: 'Extrinsic Value Left', sortable: true, getSortValue: (r) => r.extrinsic_value_left,
    render: (r) => (r.extrinsic_value_left != null ? formatCurrency(r.extrinsic_value_left) : '—') },
  { key: 'cushion_pct', label: 'Cushion to Strike', sortable: true, getSortValue: (r) => r.cushion_pct,
    render: (r) => (r.cushion_pct != null ? `${r.cushion_pct.toFixed(1)}%` : '—') },
  { key: 'days_held', label: 'Days Held', sortable: true, getSortValue: (r) => r.days_held,
    render: (r) => r.days_held ?? '—' },
  { key: 'status', label: 'Status', sortable: true,
    getSortValue: (r) => STATUS_RANK[r.status?.tone] ?? 3,
    render: (r) => (r.status ? <StatusBadge status={r.status} /> : '—') },
  { key: 'package_status', label: 'Package Status', sortable: true,
    getSortValue: (r) => PACKAGE_STATUS_RANK[r.package_status?.tone] ?? 5,
    render: (r) => (r.package_status ? <StatusBadge status={r.package_status} /> : '—') },
];

const NON_NUMERIC_COLUMNS = ['ticker', 'expiration', 'status', 'package_status'];

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
  // docs/coveredcalltable.md's KPI banner (below the table) is a
  // DELIBERATE, scoped exception to the option-P&L-only rule above -
  // Metric 3 (Open Package P&L) explicitly includes Share P&L, confirmed
  // with the user when this doc's requirements conflicted with the
  // earlier locked rule. Computed client-side over already-fetched rows,
  // same pattern as totalLivePnl above and PositionsPage's portfolioTotals.
  const packageKpis = useMemo(() => {
    let totalCapitalDeployed = 0;
    let grossPremiumCollected = 0;
    let aggregateOpenPnl = 0;
    let liquidityUnlockingFriday = 0;
    for (const r of coveredCalls) {
      const shares = r.share_quantity || 0;
      totalCapitalDeployed += (r.share_cost_basis || 0) * shares;
      grossPremiumCollected += (r.entry_price || 0) * shares;
      if (r.option_pl != null && r.share_pl != null) {
        aggregateOpenPnl += r.option_pl + r.share_pl;
      }
      if (r.spot_price != null && r.strike != null && r.spot_price >= r.strike && r.dte != null && r.dte <= 5) {
        liquidityUnlockingFriday += r.strike * shares;
      }
    }
    return {
      totalCapitalDeployed: Math.round(totalCapitalDeployed * 100) / 100,
      grossPremiumCollected: Math.round(grossPremiumCollected * 100) / 100,
      aggregateOpenPnl: Math.round(aggregateOpenPnl * 100) / 100,
      liquidityUnlockingFriday: Math.round(liquidityUnlockingFriday * 100) / 100,
    };
  }, [coveredCalls]);
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
                      <CoveredCallRowActions row={r} onClosed={refetch} onDeleted={refetch} onLotSaved={refetch} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <CoveredCallKpiBanner
            totalCapitalDeployed={packageKpis.totalCapitalDeployed}
            grossPremiumCollected={packageKpis.grossPremiumCollected}
            aggregateOpenPnl={packageKpis.aggregateOpenPnl}
            liquidityUnlockingFriday={packageKpis.liquidityUnlockingFriday}
          />

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

      <ClosedCoveredCallsSection />
    </div>
  );
}
