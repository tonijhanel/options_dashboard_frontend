import { useState, useEffect, useCallback, useMemo } from 'react';
import { getPnlRange } from '../api/client';
import { getPresetRange, PRESETS } from '../lib/dateRanges';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import { useSortableData } from '../lib/useSortableData';
import { formatDate } from '../lib/formatDate';
import tableStyles from '../components/Table.module.css';
import styles from './PnlHistoryPage.module.css';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'naked_put', label: 'Cash-Secured Puts' },
  { key: 'vertical_spread', label: 'Spreads' },
  { key: 'bwb_put', label: 'BWB' },
  { key: 'calendar', label: 'Calendar' },
];

function positionTypeLabel(positionType) {
  if (positionType === 'vertical_spread') return 'Spread';
  if (positionType === 'bwb_put') return 'BWB';
  if (positionType === 'calendar') return 'Calendar';
  return 'Naked Put';
}

const OPENED_COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (p) => p.ticker,
    render: (p) => <span className={styles.ticker}>{p.ticker}</span> },
  { key: 'position_type', label: 'Type', sortable: true, getSortValue: (p) => p.position_type,
    render: (p) => positionTypeLabel(p.position_type) },
  { key: 'strike', label: 'Strike', sortable: true, getSortValue: (p) => p.short_strike ?? p.strike,
    render: (p) => (
      p.position_type === 'vertical_spread' ? `${p.short_strike}/${p.long_strike}`
        : p.position_type === 'calendar' ? `${p.strike} (${p.expiration}/${p.calendar_back_expiration})`
          : p.strike?.toFixed(2)
    ) },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (p) => p.contracts,
    render: (p) => p.contracts },
  { key: 'entry_price', label: 'Entry Price', sortable: true, getSortValue: (p) => p.entry_price,
    render: (p) => p.entry_price?.toFixed(2) },
  { key: 'entry_date', label: 'Entry Date', sortable: true, getSortValue: (p) => p.entry_date,
    render: (p) => formatDate(p.entry_date) },
  { key: 'premium', label: 'Premium', sortable: true, getSortValue: (p) => p.premium,
    render: (p) => (p.premium !== null ? formatCurrency(p.premium) : '—') },
  { key: 'roc', label: 'ROC', sortable: true, getSortValue: (p) => p.roc,
    render: (p) => (p.roc != null ? `${p.roc.toFixed(1)}%` : '—') },
  { key: 'annualized_roc', label: 'Annualized ROC', sortable: true, getSortValue: (p) => p.annualized_roc,
    render: (p) => (p.annualized_roc != null ? `${p.annualized_roc.toFixed(1)}%` : '—') },
  { key: 'status', label: 'Status', sortable: true, getSortValue: (p) => p.status,
    render: (p) => p.status },
];

const CLOSED_COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (p) => p.ticker,
    render: (p) => <span className={styles.ticker}>{p.ticker}</span> },
  { key: 'entry_price', label: 'Entry Price', sortable: true, getSortValue: (p) => p.entry_price,
    render: (p) => p.entry_price?.toFixed(2) },
  { key: 'closed_price', label: 'Closed Price', sortable: true, getSortValue: (p) => p.closed_price,
    render: (p) => (p.closed_price !== null ? p.closed_price.toFixed(2) : '—') },
  { key: 'closed_date', label: 'Closed Date', sortable: true, getSortValue: (p) => p.closed_date,
    render: (p) => formatDate(p.closed_date) },
  { key: 'close_reason', label: 'Close Reason', sortable: true, getSortValue: (p) => p.close_reason || '',
    render: (p) => p.close_reason || 'not recorded' },
  { key: 'roc', label: 'ROC', sortable: true, getSortValue: (p) => p.roc,
    render: (p) => (p.roc != null ? `${p.roc.toFixed(1)}%` : '—') },
  { key: 'annualized_roc', label: 'Annualized ROC', sortable: true, getSortValue: (p) => p.annualized_roc,
    render: (p) => (p.annualized_roc != null ? `${p.annualized_roc.toFixed(1)}%` : '—') },
  { key: 'realized_pnl', label: 'P&L', sortable: true, getSortValue: (p) => p.realized_pnl,
    render: (p) => (p.realized_pnl !== null ? formatCurrency(p.realized_pnl) : 'missing price') },
  { key: 'net_chain_pnl', label: 'Net Chain P&L', sortable: true, getSortValue: (p) => p.net_chain_pnl,
    // Only present on rows that were rolled from or rolled into something
    // else (position_log_service.compute_chain_net_pnl) - the TRUE P&L
    // across every leg of that roll, not just this one row's own close.
    // A roll's first leg often looks like a loss on its own (that's
    // usually why you rolled); this is the number that actually answers
    // "did the roll work out."
    render: (p) => (
      p.net_chain_pnl != null ? (
        <>
          {formatCurrency(p.net_chain_pnl)}
          {p.chain_open && <span className={styles.chainOpenTag}> (chain open)</span>}
        </>
      ) : '—'
    ) },
  { key: 'net_group_pnl', label: 'Net Group P&L', sortable: true, getSortValue: (p) => p.net_group_pnl,
    // Only present on a calendar row sharing a strategy_group with
    // another calendar (position_log_service.compute_group_net_pnl,
    // docs/calendarclosing.md) - a double calendar's two legs, same
    // "one leg alone can look like a loss" reasoning as Net Chain P&L,
    // just linked by a shared tag instead of a roll chain.
    render: (p) => (
      p.net_group_pnl != null ? (
        <>
          {formatCurrency(p.net_group_pnl)}
          {p.group_open && <span className={styles.chainOpenTag}> (group open)</span>}
        </>
      ) : '—'
    ) },
];

// docs/winrates.md - win-rate/performance stats at the PACKAGE level (a
// full roll chain counted once, not each leg the way Realized P&L above
// scores things) for packages whose FINAL leg closed in the currently
// selected date range. kpis is one bucket of GET /pnl-range's
// package_kpis (already computed server-side per strategy, so this reads
// straight off `data`, not the client-side-filtered `filtered` object).
function PackageKpiCard({ kpis, strategyLabel }) {
  if (!kpis || kpis.total_trades === 0) {
    return (
      <div className={styles.kpiCard}>
        <h3 className={styles.kpiCardTitle}>Package Win Rate - {strategyLabel}</h3>
        <p className={styles.kpiEmpty}>No fully-closed packages in this range.</p>
      </div>
    );
  }

  const winRateTone = kpis.win_rate_pct >= 50 ? tableStyles.positive : tableStyles.negative;

  return (
    <div className={styles.kpiCard}>
      <h3 className={styles.kpiCardTitle}>Package Win Rate - {strategyLabel}</h3>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>True Win Rate</div>
          <div className={`${styles.kpiValue} ${winRateTone}`}>{kpis.win_rate_pct.toFixed(1)}%</div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Win / Loss</div>
          <div className={styles.kpiValue}>{kpis.winning_trades}W / {kpis.losing_trades}L</div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Recovery Ratio</div>
          <div className={styles.kpiValue}>{kpis.recovery_ratio != null ? kpis.recovery_ratio.toFixed(2) : '—'}</div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Avg Days in Trade</div>
          <div className={styles.kpiValue}>{kpis.avg_days_in_trade != null ? kpis.avg_days_in_trade.toFixed(1) : '—'}</div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Total Profit</div>
          <div className={`${styles.kpiValue} ${kpis.total_profit >= 0 ? tableStyles.positive : tableStyles.negative}`}>
            {formatCurrency(kpis.total_profit)}
          </div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Avg Winner</div>
          <div className={`${styles.kpiValue} ${tableStyles.positive}`}>
            {kpis.avg_winner != null ? formatCurrency(kpis.avg_winner) : '—'}
          </div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Avg Loser</div>
          <div className={`${styles.kpiValue} ${tableStyles.negative}`}>
            {kpis.avg_loser != null ? formatCurrency(kpis.avg_loser) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function OpenedPositionsTable({ positions }) {
  const { hidden, toggle, visibleColumns } = useColumnVisibility(OPENED_COLUMNS, 'pnlHistoryOpenedTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    positions,
    (row, key) => OPENED_COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Positions Opened in Range</h2>
        <ColumnPicker columns={OPENED_COLUMNS} hidden={hidden} onToggle={toggle} />
      </div>
      {sorted.length === 0 ? (
        <EmptyView message="No positions opened in this range." />
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
                <tr key={p.id}>
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        col.key === 'status'
                          ? (p.status === 'open' ? styles.statusOpen : tableStyles.muted)
                          : col.key === 'close_reason' || col.key === 'position_type'
                            ? ''
                            : col.key === 'ticker'
                              ? ''
                              : 'num'
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
    </section>
  );
}

function ClosedPositionsTable({ positions }) {
  const { hidden, toggle, visibleColumns } = useColumnVisibility(CLOSED_COLUMNS, 'pnlHistoryClosedTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    positions,
    (row, key) => CLOSED_COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Positions Closed in Range</h2>
        <ColumnPicker columns={CLOSED_COLUMNS} hidden={hidden} onToggle={toggle} />
      </div>
      {sorted.length === 0 ? (
        <EmptyView message="No positions closed in this range." />
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
                <tr key={p.id}>
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        col.key === 'realized_pnl'
                          ? `num ${p.realized_pnl === null ? tableStyles.muted : p.realized_pnl >= 0 ? tableStyles.positive : tableStyles.negative}`
                          : col.key === 'net_chain_pnl'
                            ? `num ${p.net_chain_pnl == null ? tableStyles.muted : p.net_chain_pnl >= 0 ? tableStyles.positive : tableStyles.negative}`
                            : col.key === 'net_group_pnl'
                              ? `num ${p.net_group_pnl == null ? tableStyles.muted : p.net_group_pnl >= 0 ? tableStyles.positive : tableStyles.negative}`
                              : col.key === 'close_reason'
                                ? (p.close_reason ? '' : tableStyles.muted)
                                : col.key === 'ticker' || col.key === 'closed_date'
                                  ? ''
                                  : 'num'
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
    </section>
  );
}

export default function PnlHistoryPage() {
  const [range, setRange] = useState(() => getPresetRange('this_month'));
  const [activePreset, setActivePreset] = useState('this_month');
  const [typeFilter, setTypeFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (start, end) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPnlRange(start, end);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    const matchesFilter = (p) => typeFilter === 'all' || p.position_type === typeFilter;

    const premiumPositions = data.premium_collected.positions.filter(matchesFilter);
    // Net-credit strategies (CSP/spread/BWB) vs. calendars (net debit) are
    // summed separately - compute_premium already returns calendars' as
    // negative (debit paid), so combining them into one total would net
    // credits against debits instead of showing either figure honestly.
    const creditPositions = premiumPositions.filter((p) => p.position_type !== 'calendar');
    const creditTotal = creditPositions.reduce((sum, p) => sum + (p.premium || 0), 0);
    const debitPositions = premiumPositions.filter((p) => p.position_type === 'calendar');
    const debitTotal = debitPositions.reduce((sum, p) => sum + (p.premium || 0), 0);

    const realizedPositions = data.realized_pnl.positions.filter(matchesFilter);
    const realizedTotal = realizedPositions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const realizedMissingCount = realizedPositions.filter((p) => p.realized_pnl === null).length;

    return {
      premium_collected: { total: creditTotal, count: creditPositions.length, positions: premiumPositions },
      premium_paid: { total: Math.abs(debitTotal), count: debitPositions.length },
      realized_pnl: {
        realized_pnl: Math.round(realizedTotal * 100) / 100,
        closed_count: realizedPositions.length,
        missing_price_count: realizedMissingCount,
        positions: realizedPositions,
      },
    };
  }, [data, typeFilter]);

  function applyPreset(presetKey) {
    setActivePreset(presetKey);
    const newRange = getPresetRange(presetKey);
    setRange(newRange);
    fetchData(newRange.start, newRange.end);
  }

  function applyCustomRange(e) {
    e.preventDefault();
    setActivePreset(null);
    fetchData(range.start, range.end);
  }

  if (loading && !data) return <LoadingView label="Loading P&L history" />;

  return (
    <div>
      <PageHeader title="P&L History" onRefresh={() => fetchData(range.start, range.end)} refreshing={loading} />

      <p className={styles.explainer}>
        <strong>Premium Collected</strong> counts every net-credit position (CSP, spread, BWB) opened in
        this range, whether it's still open or has since closed - it won't shrink as positions close.
        <strong> Premium Paid</strong> is the same idea for calendar positions, shown separately since
        they're a net-debit strategy and summing credits and debits together into one number would be
        misleading. <strong>Realized P&amp;L</strong>{' '}
        only counts positions actually closed within this range, using their recorded close price.
        For a rolled position, that's just this ONE leg's own result - see <strong>Net Chain P&amp;L</strong>{' '}
        on rows that were rolled for the true total across every leg of that roll, start to finish.
        Same idea for a double calendar's two legs, linked by a shared group tag instead of a roll -
        see <strong>Net Group P&amp;L</strong> for the combined result across both.
      </p>

      <div className={styles.controls}>
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={activePreset === p.key ? styles.presetActive : styles.preset}
              onClick={() => applyPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={applyCustomRange} className={styles.customRange}>
          <label>
            From
            <input
              type="date"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className={styles.dateInput}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className={styles.dateInput}
            />
          </label>
          <button type="submit" className={styles.applyButton}>Apply</button>
        </form>
      </div>

      <div className={styles.typeFilterRow}>
        <span className={styles.typeFilterLabel}>Position type:</span>
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.key}
            className={typeFilter === t.key ? styles.presetActive : styles.preset}
            onClick={() => setTypeFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
        {typeFilter === 'vertical_spread' && filtered && (() => {
          const allSpreadRows = [...filtered.premium_collected.positions, ...filtered.realized_pnl.positions];
          const hasLegacyRow = allSpreadRows.some(
            (p) => p.short_entry_price === null || p.short_entry_price === undefined
          );
          if (!hasLegacyRow) return null;
          return (
            <span className={styles.spreadWarning}>
              Some older spreads (logged before per-leg tracking existed) show an approximate premium/P&L -
              spreads logged since then use real per-leg data and are accurate.
            </span>
          );
        })()}
      </div>

      {error && <ErrorView message={error} onRetry={() => fetchData(range.start, range.end)} />}

      {filtered && (
        <>
          <SummaryBar
            items={[
              {
                label: 'Premium Collected',
                value: filtered.premium_collected.total,
                sub: `${filtered.premium_collected.count} net-credit position(s) opened in range`,
                subTone: 'neutral',
              },
              {
                label: 'Premium Paid',
                value: filtered.premium_paid.total,
                sub: `${filtered.premium_paid.count} calendar position(s) opened in range`,
                subTone: 'neutral',
              },
              {
                label: 'Realized P&L',
                value: filtered.realized_pnl.realized_pnl,
                subTone: filtered.realized_pnl.realized_pnl >= 0 ? 'positive' : undefined,
                sub: filtered.realized_pnl.missing_price_count > 0
                  ? `${filtered.realized_pnl.missing_price_count} close(s) missing price - not included`
                  : `${filtered.realized_pnl.closed_count} position(s) closed in range`,
              },
            ]}
          />

          {data?.package_kpis && (
            <PackageKpiCard
              kpis={data.package_kpis[typeFilter]}
              strategyLabel={TYPE_FILTERS.find((t) => t.key === typeFilter)?.label}
            />
          )}

          <OpenedPositionsTable positions={filtered.premium_collected.positions} />
          <ClosedPositionsTable positions={filtered.realized_pnl.positions} />
        </>
      )}
    </div>
  );
}