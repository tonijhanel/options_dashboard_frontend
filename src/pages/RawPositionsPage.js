import { useMemo, useState } from 'react';
import { getRawPositions } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import { formatCurrency } from '../components/SummaryBar';
import tableStyles from '../components/Table.module.css';
import styles from './RawPositionsPage.module.css';

// Everything currently held across every connected brokerage account,
// straight from SnapTrade - no strategy classification, no exclusion
// logic (unlike CSP Positions, which is scoped to naked cash-secured
// puts only and silently drops anything else, e.g. a long call). Built
// as a simple "what do I actually have" viewer, not for evaluation -
// no column sorting (2026-08 decision) - rows are always grouped so
// multi-leg positions read as one cluster, with Ticker/Type/Broker
// filters instead for narrowing down what you're looking at.
function typeLabel(row) {
  if (row.instrument_kind === 'option') return row.option_type || 'Option';
  if (row.instrument_kind) return row.instrument_kind.charAt(0).toUpperCase() + row.instrument_kind.slice(1);
  return '—';
}

// units * (price - cost_basis) * multiplier. units is already signed by
// SnapTrade (positive = long, negative = short), so this falls out
// correctly for both without any extra sign handling. Multiplier is 100
// for options (1 contract = 100 underlying shares) since SnapTrade's own
// price/cost_basis for an option row are both per-share premiums, not
// pre-multiplied contract totals - 1 for everything else (stock/ETF/ADR).
function unrealizedPL(row) {
  if (row.units == null || row.price == null || row.cost_basis == null) return null;
  const multiplier = row.instrument_kind === 'option' ? 100 : 1;
  return row.units * (row.price - row.cost_basis) * multiplier;
}

const COLUMNS = [
  { key: 'institution_name', label: 'Broker', alwaysVisible: true,
    render: (r) => r.institution_name || '—' },
  { key: 'account_name', label: 'Account',
    render: (r) => r.account_name || r.account_number || '—' },
  { key: 'ticker', label: 'Ticker', alwaysVisible: true,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'spot', label: 'Spot',
    // The underlying's live price - same value on a stock row and every
    // option leg sharing that ticker. Comes from a Schwab quote
    // (raw_positions_service.py), not SnapTrade - null if that quote
    // call wasn't available for any reason, never blocks the rest of
    // the row from showing.
    render: (r) => (r.spot_price != null ? Number(r.spot_price).toFixed(2) : '—') },
  { key: 'type', label: 'Type',
    render: (r) => typeLabel(r) },
  { key: 'strike', label: 'Strike',
    render: (r) => (r.strike != null ? Number(r.strike).toFixed(2) : '—') },
  { key: 'expiration', label: 'Expiration',
    render: (r) => r.expiration || '—' },
  { key: 'units', label: 'Quantity',
    render: (r) => (r.units != null ? r.units : '—') },
  { key: 'price', label: 'Price',
    render: (r) => (r.price != null ? Number(r.price).toFixed(2) : '—') },
  { key: 'cost_basis', label: 'Cost Basis',
    render: (r) => (r.cost_basis != null ? Number(r.cost_basis).toFixed(2) : '—') },
  { key: 'unrealized_pl', label: 'Unrealized P/L',
    render: (r) => {
      const pl = unrealizedPL(r);
      return pl != null
        ? <span className={pl >= 0 ? tableStyles.positive : tableStyles.negative}>{formatCurrency(pl)}</span>
        : '—';
    } },
  { key: 'order_group_id', label: 'Group',
    render: (r) => (r.groupLabel ? <span className={styles.groupTag}>{r.groupLabel}</span> : '—') },
];

const NON_NUMERIC_COLUMNS = ['institution_name', 'account_name', 'ticker', 'type', 'expiration', 'order_group_id'];

// ticker, then order_group_id (so legs sharing an order cluster within
// their ticker), then strike - deterministic, no user-driven sort needed.
function groupKey(row) {
  return `${row.ticker}::${row.order_group_id || ''}`;
}

function sortForGrouping(rows) {
  return [...rows].sort((a, b) => {
    if (a.ticker !== b.ticker) return a.ticker.localeCompare(b.ticker);
    const aGroup = a.order_group_id || '';
    const bGroup = b.order_group_id || '';
    if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);
    const aStrike = a.strike ?? -Infinity;
    const bStrike = b.strike ?? -Infinity;
    return aStrike - bStrike;
  });
}

export default function RawPositionsPage() {
  const { data, error, loading, refetch } = useApiData(getRawPositions, 'rawPositions');
  const [brokerFilter, setBrokerFilter] = useState('ALL');
  const [tickerFilter, setTickerFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'rawPositionsTable', []);

  // Legs placed together as one multi-leg order share an order_group_id
  // (see raw_positions_service.py's docstring - inferred from SnapTrade's
  // own brokerage_order_id naming convention, verified live). Relabeled
  // here as short G1/G2/... tags for display - computed off the FULL
  // unfiltered list so a group's label stays stable regardless of the
  // filters below.
  const positions = useMemo(() => {
    const raw = data?.positions || [];
    const ids = Array.from(new Set(raw.map((p) => p.order_group_id).filter(Boolean))).sort();
    const labelById = {};
    ids.forEach((id, i) => { labelById[id] = `G${i + 1}`; });
    return raw.map((p) => ({ ...p, groupLabel: p.order_group_id ? labelById[p.order_group_id] : null }));
  }, [data]);

  // Every filter's own option list is populated from whatever values
  // actually come back, not hardcoded - SnapTrade's exact per-broker
  // strings (Schwab/E*Trade/Tastytrade) weren't verified against live
  // data before shipping (2026-08).
  const brokers = useMemo(
    () => Array.from(new Set(positions.map((p) => p.institution_name).filter(Boolean))).sort(),
    [positions]
  );
  const tickers = useMemo(
    () => Array.from(new Set(positions.map((p) => p.ticker).filter(Boolean))).sort(),
    [positions]
  );
  const types = useMemo(
    () => Array.from(new Set(positions.map((p) => typeLabel(p)).filter((t) => t !== '—'))).sort(),
    [positions]
  );

  const filtered = positions.filter((p) => (
    (brokerFilter === 'ALL' || p.institution_name === brokerFilter)
    && (tickerFilter === 'ALL' || p.ticker === tickerFilter)
    && (typeFilter === 'ALL' || typeLabel(p) === typeFilter)
  ));
  const sorted = useMemo(() => sortForGrouping(filtered), [filtered]);

  if (loading && !data) return <LoadingView label="Loading positions" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="All Positions" onRefresh={refetch} refreshing={loading} />

      <p className={styles.intro}>
        Everything currently held across every connected brokerage account, straight from SnapTrade - no
        strategy classification, no filtering. Stocks, ETFs, and options (puts and calls, long and short),
        always grouped so legs placed together as one multi-leg order read as one cluster - inferred from
        order history, so grouping only covers positions opened within the last 180 days.
      </p>

      <div className={styles.controlsRow}>
        <div className={styles.filters}>
          <select className={styles.filterSelect} value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)}>
            <option value="ALL">All Brokers</option>
            {brokers.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className={styles.filterSelect} value={tickerFilter} onChange={(e) => setTickerFilter(e.target.value)}>
            <option value="ALL">All Tickers</option>
            {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={styles.filterSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">All Types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
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
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const isNewGroup = i === 0 || groupKey(sorted[i - 1]) !== groupKey(r);
                return (
                  <tr
                    key={`${r.account_id}-${r.ticker}-${r.strike}-${r.expiration}-${i}`}
                    className={isNewGroup ? styles.groupBoundary : ''}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'}>
                        {col.render(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
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
