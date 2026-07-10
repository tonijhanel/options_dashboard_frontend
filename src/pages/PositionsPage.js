import { useState, useMemo, useEffect } from 'react';
import { getPositions, getRealizedPnl } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { computeStatus } from '../lib/positionSignal';
import { computeRollRecommendation } from '../lib/positionRisk';
import { computeROC, computeAnnualizedROC, computeROCTier } from '../lib/capitalEfficiency';
import ROCTierBadge from '../components/ROCTierBadge';
import { generateRiskCurve } from '../lib/riskCurve';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import ProfitTargetSlider from '../components/ProfitTargetSlider';
import StatusBadge from '../components/StatusBadge';
import RecommendationBadge from '../components/RecommendationBadge';
import RollRecommendationPanel from '../components/RollRecommendationPanel';
import RiskCurveChart from '../components/RiskCurveChart';
import PageHeader from '../components/PageHeader';
import NewsPreview from '../components/NewsPreview';
import { useNewsSentiment } from '../lib/useNewsSentiment';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import tableStyles from '../components/Table.module.css';
import styles from './PositionsPage.module.css';

// Tier ranking so "Recommendation" can be sorted meaningfully - action
// (most urgent) sorts first in ascending order, matching how you'd
// actually want to triage these.
const TIER_RANK = { action: 0, caution: 1, safe: 2 };

// Single source of truth for the table: label, whether it's sortable, how
// to pull a comparable value out of a row for sorting, and how to render
// the cell. Both the column picker and the sort logic read from this list,
// so there's no way for them to drift out of sync with each other.
const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (p) => p.ticker,
    render: (p) => <span className={styles.ticker}>{p.ticker}</span> },
  { key: 'sector', label: 'Sector', sortable: true, getSortValue: (p) => p.sector || 'Untracked',
    render: (p) => <span className={p.sector ? '' : tableStyles.muted}>{p.sector || 'Untracked'}</span> },
  { key: 'spot', label: 'Spot', sortable: true, getSortValue: (p) => p.spot,
    render: (p) => p.spot?.toFixed(2) },
  { key: 'strike', label: 'Strike', sortable: true, getSortValue: (p) => p.strike,
    render: (p) => p.strike?.toFixed(2) },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (p) => p.contracts,
    render: (p) => p.contracts },
  { key: 'entry_price', label: 'Entry', sortable: true, getSortValue: (p) => p.entry_price,
    render: (p) => p.entry_price?.toFixed(2) },
  { key: 'mid', label: 'Mid', sortable: true, getSortValue: (p) => p.mid,
    render: (p) => p.mid?.toFixed(2) },
  { key: 'pl_dollars', label: 'P&L', sortable: true, getSortValue: (p) => p.pl_dollars,
    render: (p) => (
      <span className={p.pl_dollars >= 0 ? tableStyles.positive : tableStyles.negative}>
        {formatCurrency(p.pl_dollars)}
      </span>
    ) },
  { key: 'delta', label: 'Delta', sortable: true, getSortValue: (p) => p.delta,
    render: (p) => p.delta?.toFixed(3) },
  { key: 'theta', label: 'Theta', sortable: true, getSortValue: (p) => p.theta,
    render: (p) => p.theta?.toFixed(3) },
  { key: 'iv', label: 'IV', sortable: true, getSortValue: (p) => p.iv,
    render: (p) => (p.iv !== null && p.iv !== undefined ? `${(p.iv * 100).toFixed(1)}%` : '—') },
  { key: 'rsi', label: 'RSI', sortable: true, getSortValue: (p) => p.rsi,
    render: (p) => p.rsi?.toFixed(1) },
  { key: 'dte', label: 'DTE', sortable: true, getSortValue: (p) => p.dte,
    render: (p) => p.dte },
  { key: 'days_held', label: 'Days Held', sortable: true, getSortValue: (p) => p.days_held,
    render: (p) => p.days_held ?? '—' },
  { key: 'roc', label: 'ROC', sortable: true,
    getSortValue: (p) => computeROC(p.entry_price, p.strike),
    render: (p) => {
      const roc = computeROC(p.entry_price, p.strike);
      return roc !== null ? `${roc.toFixed(2)}%` : '—';
    } },
  { key: 'annualized_roc', label: 'Annualized ROC', sortable: true,
    getSortValue: (p) => computeAnnualizedROC(computeROC(p.entry_price, p.strike), p.dte),
    render: (p) => {
      const roc = computeAnnualizedROC(computeROC(p.entry_price, p.strike), p.dte);
      return roc !== null ? `${roc.toFixed(2)}%` : '—';
    } },
  { key: 'roc_tier', label: 'ROC Tier', sortable: true,
    getSortValue: (p) => {
      const tier = computeROCTier(computeAnnualizedROC(computeROC(p.entry_price, p.strike), p.dte));
      return { skip: 0, sweet_spot: 1, alpha: 2 }[tier] ?? 3;
    },
    render: (p) => {
      const tier = computeROCTier(computeAnnualizedROC(computeROC(p.entry_price, p.strike), p.dte));
      return <ROCTierBadge tier={tier} />;
    } },
  { key: 'status', label: 'Status', sortable: true, getSortValue: (p) => p.status.label,
    render: (p) => <StatusBadge status={p.status} /> },
  { key: 'recommendation', label: 'Recommendation', sortable: true,
    getSortValue: (p) => TIER_RANK[p.recommendation.tier],
    render: (p) => <RecommendationBadge tier={p.recommendation.tier} /> },
];

export default function PositionsPage() {
  const [profitTarget, setProfitTarget] = useState(80);
  const [selectedKey, setSelectedKey] = useState(null);
  const { data, error, loading, refetch } = useApiData(getPositions, 'positions');
  const { data: realizedPnl, refetch: refetchRealizedPnl } = useApiData(getRealizedPnl, 'realized-pnl');
  const { getEntry: getNewsEntry } = useNewsSentiment();

  const positionsWithStatus = useMemo(() => {
    if (!data?.positions) return [];
    return data.positions.map((p) => ({
      ...p,
      status: computeStatus(p.entry_price, p.mid, p.spot, p.strike, p.dte, profitTarget),
      recommendation: computeRollRecommendation(p),
    }));
  }, [data, profitTarget]);

  // Sensible first-time defaults: hide secondary technical detail
  // (sector context, raw greeks/technicals, days held, non-annualized
  // ROC) that matters less for a quick "anything need attention today"
  // glance than P&L, DTE, the annualized ROC/tier, and the status/
  // recommendation badges. Only applies the very first time this table
  // loads for someone - any customization you make afterward always wins.
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'positionsTable', [
    'sector', 'delta', 'theta', 'iv', 'rsi', 'days_held', 'roc',
  ]);
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    positionsWithStatus,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  const portfolioTotals = useMemo(() => {
    if (!data?.positions) return { grossPremium: 0, currentPL: 0 };
    return data.positions.reduce(
      (acc, p) => ({
        grossPremium: acc.grossPremium + Math.abs(p.contracts) * Math.abs(p.entry_price) * 100,
        currentPL: acc.currentPL + (p.pl_dollars || 0),
      }),
      { grossPremium: 0, currentPL: 0 }
    );
  }, [data]);

  // Default the detail selector to the position most in need of
  // attention - an 'action' tier if one exists, otherwise just the first
  // position - rather than an arbitrary default, since the whole point of
  // this section is surfacing what needs a decision first.
  useEffect(() => {
    if (!selectedKey && positionsWithStatus.length > 0) {
      const actionable = positionsWithStatus.find((p) => p.recommendation.tier === 'action');
      const target = actionable || positionsWithStatus[0];
      setSelectedKey(`${target.ticker}-${target.strike}-${target.expiration}`);
    }
  }, [positionsWithStatus, selectedKey]);

  const selected = useMemo(
    () => positionsWithStatus.find((p) => `${p.ticker}-${p.strike}-${p.expiration}` === selectedKey),
    [positionsWithStatus, selectedKey]
  );

  const riskCurveData = useMemo(() => (selected ? generateRiskCurve(selected) : null), [selected]);

  // Only show the full-page loading view when there's genuinely no data
  // yet (first visit this session). A manual Refresh click sets loading
  // back to true too, but by then `data` is already populated - in that
  // case we keep showing the existing table and just disable/relabel the
  // Refresh button, rather than blanking the whole page on every refresh.
  if (loading && !data) return <LoadingView label="Loading positions" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Positions"
        onRefresh={() => {
          refetch();
          refetchRealizedPnl();
        }}
        refreshing={loading}
      />

      {error && <ErrorView message={error} onRetry={refetch} />}

      <SummaryBar
        items={[
          {
            label: 'Total Gross Premium Collected',
            value: portfolioTotals.grossPremium,
            sub: 'Day-one cash cushion across active contracts',
            subTone: 'neutral',
          },
          {
            label: 'Current Profit/Loss',
            value: portfolioTotals.currentPL,
            subTone: portfolioTotals.currentPL >= 0 ? 'positive' : undefined,
          },
          ...(realizedPnl
            ? [
                {
                  label: 'Realized P&L Today',
                  value: realizedPnl.today.realized_pnl,
                  subTone: realizedPnl.today.realized_pnl >= 0 ? 'positive' : undefined,
                  sub: realizedPnl.today.missing_price_count > 0
                    ? `${realizedPnl.today.missing_price_count} close(s) missing price - not included`
                    : `${realizedPnl.today.closed_count} position(s) closed`,
                },
                {
                  label: 'Realized P&L This Week',
                  value: realizedPnl.this_week.realized_pnl,
                  subTone: realizedPnl.this_week.realized_pnl >= 0 ? 'positive' : undefined,
                  sub: realizedPnl.this_week.missing_price_count > 0
                    ? `${realizedPnl.this_week.missing_price_count} close(s) missing price - not included`
                    : `${realizedPnl.this_week.closed_count} position(s) closed`,
                },
              ]
            : []),
        ]}
      />

      <SummaryBar
        items={[
          { label: 'Net Liquidation', value: data.net_liq },
          {
            label: 'Buying Power',
            value: data.buying_power,
            sub: data.net_liq ? `${Math.round((data.buying_power / data.net_liq) * 100)}% of net liq` : null,
            subTone: 'info',
          },
          {
            label: 'Cash Sweep',
            value: data.cash_sweep,
            sub: data.net_liq ? `${Math.round((data.cash_sweep / data.net_liq) * 100)}% in cash` : null,
            subTone: 'neutral',
          },
        ]}
      />

      <ProfitTargetSlider value={profitTarget} onChange={setProfitTarget} />

      {positionsWithStatus.length === 0 ? (
        <EmptyView message="No open cash-secured put positions right now." />
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
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const key = `${p.ticker}-${p.strike}-${p.expiration}`;
                  return (
                    <tr key={`${key}-${i}`} className={styles.clickableRow} onClick={() => setSelectedKey(key)}>
                      {visibleColumns.map((col) => (
                        <td key={col.key} className={['status', 'recommendation', 'sector', 'roc_tier'].includes(col.key) ? '' : 'num'}>
                          {col.key === 'ticker' ? (
                            <NewsPreview scope="ticker" scopeKey={p.ticker} getEntry={getNewsEntry}>
                              {col.render(p)}
                            </NewsPreview>
                          ) : (
                            col.render(p)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && riskCurveData && (
            <>
              <div className={styles.selectorRow}>
                <label htmlFor="position-select" className={styles.selectorLabel}>
                  Position detail - click a row above, or select here:
                </label>
                <select
                  id="position-select"
                  className={styles.selector}
                  value={selectedKey || ''}
                  onChange={(e) => setSelectedKey(e.target.value)}
                >
                  {positionsWithStatus.map((p) => {
                    const key = `${p.ticker}-${p.strike}-${p.expiration}`;
                    return (
                      <option key={key} value={key}>
                        {p.ticker} - ${p.strike.toFixed(2)} exp {p.expiration}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className={styles.detailCard}>
                <RollRecommendationPanel
                  ticker={selected.ticker}
                  strike={selected.strike}
                  spot={selected.spot}
                  recommendation={selected.recommendation}
                />
              </div>

              <div className={styles.detailCard}>
                <h2 className={styles.chartTitle}>
                  Risk Curve for {selected.ticker} (Strike{' '}
                  <span className="num">${selected.strike.toFixed(2)}</span> | Premium Collected:{' '}
                  <span className="num">{formatCurrency(riskCurveData.maxProfit)}</span> | {selected.dte} DTE)
                </h2>
                <RiskCurveChart
                  curve={riskCurveData.curve}
                  spot={selected.spot}
                  breakeven={riskCurveData.breakeven}
                />
              </div>
            </>
          )}
        </>
      )}

      {data._excluded_multi_leg_positions?.length > 0 && (
        <div className={styles.excludedNote}>
          <strong>Not shown above ({data._excluded_multi_leg_positions.length}):</strong> multi-leg
          spreads aren't modeled as CSPs yet - tracked separately in position_log.
          <ul>
            {data._excluded_multi_leg_positions.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}