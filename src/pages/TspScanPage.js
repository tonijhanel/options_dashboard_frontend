import { useState } from 'react';
import { getTspPortfolio } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { computeROCTier } from '../lib/capitalEfficiency';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import TradeSignalBadge from '../components/TradeSignalBadge';
import ROCTierBadge from '../components/ROCTierBadge';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import tableStyles from '../components/Table.module.css';
import styles from './TspScanPage.module.css';

const TIER_RANK = { skip: 0, sweet_spot: 1, alpha: 2 };

// Same column-definition pattern as PositionsPage - one source of truth
// driving both the column picker and the sort logic.
const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (p) => p.ticker,
    render: (p) => <span className={styles.ticker}>{p.ticker}</span> },
  { key: 'group', label: 'Group', sortable: true, getSortValue: (p) => p.group,
    render: (p) => p.group },
  { key: 'sector', label: 'Sector', sortable: true, getSortValue: (p) => p.sector || 'Untracked',
    render: (p) => <span className={p.sector ? '' : tableStyles.muted}>{p.sector || 'Untracked'}</span> },
  { key: 'spot_price', label: 'Spot', sortable: true, getSortValue: (p) => p.spot_price,
    render: (p) => p.spot_price?.toFixed(2) },
  { key: 'selected_strike', label: 'Strike', sortable: true, getSortValue: (p) => p.selected_strike,
    render: (p) => p.selected_strike?.toFixed(2) },
  { key: 'actual_delta', label: 'Delta', sortable: true, getSortValue: (p) => p.actual_delta,
    render: (p) => p.actual_delta?.toFixed(3) },
  { key: 'days_to_expiration', label: 'DTE', sortable: true, getSortValue: (p) => p.days_to_expiration,
    render: (p) => p.days_to_expiration },
  { key: 'mid', label: 'Mid', sortable: true, getSortValue: (p) => p.mid,
    render: (p) => p.mid?.toFixed(2) },
  { key: 'monthly_yield_pct', label: 'ROC', sortable: true, getSortValue: (p) => p.monthly_yield_pct,
    render: (p) => (p.monthly_yield_pct !== null && p.monthly_yield_pct !== undefined ? `${p.monthly_yield_pct.toFixed(2)}%` : '—') },
  { key: 'annualized_yield_pct', label: 'Annualized ROC', sortable: true, getSortValue: (p) => p.annualized_yield_pct,
    render: (p) => (p.annualized_yield_pct !== null && p.annualized_yield_pct !== undefined ? `${p.annualized_yield_pct.toFixed(1)}%` : '—') },
  { key: 'roc_tier', label: 'ROC Tier', sortable: true,
    getSortValue: (p) => TIER_RANK[computeROCTier(p.annualized_yield_pct)] ?? 3,
    render: (p) => <ROCTierBadge tier={computeROCTier(p.annualized_yield_pct)} /> },
  { key: 'collateral_required', label: 'Collateral', sortable: true, getSortValue: (p) => p.collateral_required,
    render: (p) => formatCurrency(p.collateral_required) },
  { key: 'recommended_contracts', label: 'Contracts', sortable: true, getSortValue: (p) => p.recommended_contracts,
    render: (p) => p.recommended_contracts },
  { key: 'trade_signal', label: 'Signal', sortable: true, getSortValue: (p) => p.trade_signal,
    render: (p) => <TradeSignalBadge signal={p.trade_signal} /> },
  { key: 'trade_signal_reason', label: 'Reason', sortable: true, getSortValue: (p) => p.trade_signal_reason || '',
    render: (p) => p.trade_signal_reason },
];

const NON_NUMERIC_COLUMNS = ['sector', 'roc_tier', 'trade_signal', 'trade_signal_reason', 'group'];

export default function TspScanPage() {
  const { data, error, loading, refetch } = useApiData(getTspPortfolio, 'tsp-portfolio');
  const [signalFilter, setSignalFilter] = useState('ALL');
  // Sensible first-time defaults - Group/Sector are internal
  // classification rather than decision-relevant, actual_delta is
  // usually close to the config target anyway, and monthly_yield_pct is
  // redundant once annualized_yield_pct is visible (that's the number
  // that actually feeds the trade decision). Only applies the very first
  // time; any customization afterward always wins.
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'tspScanTable', [
    'group', 'sector', 'actual_delta', 'monthly_yield_pct',
  ]);

  const portfolio = data?.portfolio || [];
  const filtered = signalFilter === 'ALL' ? portfolio : portfolio.filter((p) => p.trade_signal === signalFilter);
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    filtered,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  if (loading && !data) return <LoadingView label="Scanning registry" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="TSP Scan" onRefresh={refetch} refreshing={loading} />

      {error && <ErrorView message={error} onRetry={refetch} />}

      <SummaryBar
        items={[
          {
            label: 'Total Active Collateral',
            value: data.total_active_collateral,
            sub: `${(data.portfolio || []).filter((p) => p.trade_signal === 'TRADE').length} TRADE signals`,
            subTone: 'positive',
          },
          { label: 'Max Monthly Premium', value: data.total_max_monthly_options_premium },
          {
            label: 'Managed Monthly Premium',
            value: data.total_managed_monthly_options_premium,
            sub: '50% of max - conservative estimate',
            subTone: 'neutral',
          },
        ]}
      />

      <div className={styles.controlsRow}>
        <div className={styles.filterRow}>
          {['ALL', 'TRADE', 'WAIT'].map((option) => (
            <button
              key={option}
              className={option === signalFilter ? styles.filterActive : styles.filter}
              onClick={() => setSignalFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <ColumnPicker columns={COLUMNS} hidden={hidden} onToggle={toggle} />
      </div>

      {sorted.length === 0 ? (
        <EmptyView message="No candidates match this filter." />
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
              {sorted.map((p) => (
                <tr key={p.ticker}>
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        col.key === 'trade_signal_reason'
                          ? tableStyles.wrapCell
                          : NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'
                      }
                    >
                      {col.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data._errors && (
        <div className={styles.errorsNote}>
          <strong>Some tickers didn't return data:</strong>
          <ul>
            {Object.entries(data._errors).map(([ticker, msg]) => (
              <li key={ticker}>
                {ticker}: {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}