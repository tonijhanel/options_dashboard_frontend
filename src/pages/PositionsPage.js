import { useState, useMemo } from 'react';
import { getPositions } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { computeStatus } from '../lib/positionSignal';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import ProfitTargetSlider from '../components/ProfitTargetSlider';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import tableStyles from '../components/Table.module.css';
import styles from './PositionsPage.module.css';

export default function PositionsPage() {
  const [profitTarget, setProfitTarget] = useState(80);
  const { data, error, loading, refetch } = useApiData(getPositions, 'positions');

  const positionsWithStatus = useMemo(() => {
    if (!data?.positions) return [];
    return data.positions.map((p) => ({
      ...p,
      status: computeStatus(p.entry_price, p.mid, p.spot, p.strike, p.dte, profitTarget),
    }));
  }, [data, profitTarget]);

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
      <PageHeader title="Positions" onRefresh={refetch} refreshing={loading} />

      {error && <ErrorView message={error} onRetry={refetch} />}

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
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Sector</th>
                <th>Spot</th>
                <th>Strike</th>
                <th>Contracts</th>
                <th>Entry</th>
                <th>Mid</th>
                <th>P&amp;L</th>
                <th>Delta</th>
                <th>Theta</th>
                <th>IV</th>
                <th>RSI</th>
                <th>DTE</th>
                <th>Days Held</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {positionsWithStatus.map((p, i) => (
                <tr key={`${p.ticker}-${p.strike}-${p.expiration}-${i}`}>
                  <td className={styles.ticker}>{p.ticker}</td>
                  <td className={p.sector ? '' : tableStyles.muted}>{p.sector || 'Untracked'}</td>
                  <td className="num">{p.spot?.toFixed(2)}</td>
                  <td className="num">{p.strike?.toFixed(2)}</td>
                  <td className="num">{p.contracts}</td>
                  <td className="num">{p.entry_price?.toFixed(2)}</td>
                  <td className="num">{p.mid?.toFixed(2)}</td>
                  <td className={`num ${p.pl_dollars >= 0 ? tableStyles.positive : tableStyles.negative}`}>
                    {formatCurrency(p.pl_dollars)}
                  </td>
                  <td className="num">{p.delta?.toFixed(3)}</td>
                  <td className="num">{p.theta?.toFixed(3)}</td>
                  <td className="num">{p.iv !== null ? `${(p.iv * 100).toFixed(1)}%` : '—'}</td>
                  <td className="num">{p.rsi?.toFixed(1)}</td>
                  <td className="num">{p.dte}</td>
                  <td className="num">{p.days_held ?? '—'}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
