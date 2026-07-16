import { useState } from 'react';
import { getActiveSpreads, updatePositionLogEntry } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import tableStyles from '../components/Table.module.css';
import styles from './ActiveSpreadsPage.module.css';

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

// Same column-definition pattern as PositionsPage/TspScanPage - one source
// of truth driving both the column picker and the sort logic.
const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'short_strike', label: 'Short Strike', sortable: true, getSortValue: (r) => r.short_strike,
    render: (r) => r.short_strike?.toFixed(2) },
  { key: 'long_strike', label: 'Long Strike', sortable: true, getSortValue: (r) => r.long_strike,
    render: (r) => r.long_strike?.toFixed(2) },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration,
    render: (r) => r.expiration },
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
];

const NON_NUMERIC_COLUMNS = ['ticker', 'expiration'];

export default function ActiveSpreadsPage() {
  const { data, error, loading, refetch } = useApiData(getActiveSpreads, 'activeSpreads');

  const spreads = data?.spreads || [];
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'activeSpreadsTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    spreads,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

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
                      <SpreadRowActions row={r} onClosed={refetch} />
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
          <strong>Some spreads may be missing or incomplete:</strong>
          <p>{data._error}</p>
        </div>
      )}
    </div>
  );
}
