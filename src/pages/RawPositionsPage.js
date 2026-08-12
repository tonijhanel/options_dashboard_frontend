import { useMemo, useState } from 'react';
import { getRawPositions } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import tableStyles from '../components/Table.module.css';
import styles from './RawPositionsPage.module.css';

// Everything currently held across every connected brokerage account,
// straight from SnapTrade - no strategy classification, no exclusion
// logic (unlike CSP Positions, which is scoped to naked cash-secured
// puts only and silently drops anything else, e.g. a long call). Built
// as a simple "what do I actually have" viewer, not for tracking/P&L.
function typeLabel(row) {
  if (row.instrument_kind === 'option') return row.option_type || 'Option';
  if (row.instrument_kind) return row.instrument_kind.charAt(0).toUpperCase() + row.instrument_kind.slice(1);
  return '—';
}

const COLUMNS = [
  { key: 'institution_name', label: 'Broker', alwaysVisible: true, sortable: true,
    getSortValue: (r) => r.institution_name || '',
    render: (r) => r.institution_name || '—' },
  { key: 'account_name', label: 'Account', sortable: true,
    getSortValue: (r) => r.account_name || r.account_number || '',
    render: (r) => r.account_name || r.account_number || '—' },
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'type', label: 'Type', sortable: true, getSortValue: (r) => typeLabel(r),
    render: (r) => typeLabel(r) },
  { key: 'strike', label: 'Strike', sortable: true, getSortValue: (r) => r.strike,
    render: (r) => (r.strike != null ? Number(r.strike).toFixed(2) : '—') },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration,
    render: (r) => r.expiration || '—' },
  { key: 'units', label: 'Quantity', sortable: true, getSortValue: (r) => r.units,
    render: (r) => (r.units != null ? r.units : '—') },
  { key: 'price', label: 'Price', sortable: true, getSortValue: (r) => r.price,
    render: (r) => (r.price != null ? Number(r.price).toFixed(2) : '—') },
  { key: 'cost_basis', label: 'Cost Basis', sortable: true, getSortValue: (r) => r.cost_basis,
    render: (r) => (r.cost_basis != null ? Number(r.cost_basis).toFixed(2) : '—') },
  { key: 'order_group_id', label: 'Group', sortable: true, getSortValue: (r) => r.order_group_id || '',
    render: (r) => (r.groupLabel ? <span className={styles.groupTag}>{r.groupLabel}</span> : '—') },
];

const NON_NUMERIC_COLUMNS = ['institution_name', 'account_name', 'ticker', 'type', 'expiration', 'order_group_id'];

export default function RawPositionsPage() {
  const { data, error, loading, refetch } = useApiData(getRawPositions, 'rawPositions');
  const [brokerFilter, setBrokerFilter] = useState('ALL');
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'rawPositionsTable', []);

  // Legs placed together as one multi-leg order share an order_group_id
  // (see raw_positions_service.py's docstring - inferred from SnapTrade's
  // own brokerage_order_id naming convention, verified live). Relabeled
  // here as short G1/G2/... tags for display - computed off the FULL
  // unfiltered list so a group's label stays stable regardless of the
  // broker filter, sorted numerically so clicking the Group column
  // actually clusters legs together adjacently.
  const positions = useMemo(() => {
    const raw = data?.positions || [];
    const ids = Array.from(new Set(raw.map((p) => p.order_group_id).filter(Boolean))).sort();
    const labelById = {};
    ids.forEach((id, i) => { labelById[id] = `G${i + 1}`; });
    return raw.map((p) => ({ ...p, groupLabel: p.order_group_id ? labelById[p.order_group_id] : null }));
  }, [data]);

  // Populated from whatever institution_name values actually come back,
  // not hardcoded - SnapTrade's exact per-broker strings (Schwab/E*Trade/
  // Tastytrade) weren't verified against live data before shipping (2026-08).
  const brokers = useMemo(
    () => Array.from(new Set(positions.map((p) => p.institution_name).filter(Boolean))).sort(),
    [positions]
  );

  const filtered = brokerFilter === 'ALL' ? positions : positions.filter((p) => p.institution_name === brokerFilter);
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    filtered,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  if (loading && !data) return <LoadingView label="Loading positions" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="All Positions" onRefresh={refetch} refreshing={loading} />

      <p className={styles.intro}>
        Everything currently held across every connected brokerage account, straight from SnapTrade - no
        strategy classification, no filtering. Stocks, ETFs, and options (puts and calls, long and short).
        Legs placed together as one multi-leg order share a Group tag (click the Group column to cluster
        them) - inferred from order history, so it only covers positions opened within the last 180 days.
      </p>

      <div className={styles.controlsRow}>
        <select
          className={styles.brokerSelect}
          value={brokerFilter}
          onChange={(e) => setBrokerFilter(e.target.value)}
        >
          <option value="ALL">All Brokers</option>
          {brokers.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <ColumnPicker columns={COLUMNS} hidden={hidden} onToggle={toggle} />
      </div>

      {sorted.length === 0 ? (
        <EmptyView message="No positions found." />
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
              {sorted.map((r, i) => (
                <tr key={`${r.account_id}-${r.ticker}-${r.strike}-${r.expiration}-${i}`}>
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'}>
                      {col.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data._error && (
        <div className={styles.errorsNote}>
          <strong>Some accounts may be missing:</strong>
          <p>{data._error}</p>
        </div>
      )}
    </div>
  );
}
