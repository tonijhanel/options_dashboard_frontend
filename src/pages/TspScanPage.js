import { useState } from 'react';
import { getTspPortfolio } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import TradeSignalBadge from '../components/TradeSignalBadge';
import PageHeader from '../components/PageHeader';
import tableStyles from '../components/Table.module.css';
import styles from './TspScanPage.module.css';

export default function TspScanPage() {
  const { data, error, loading, refetch } = useApiData(getTspPortfolio, 'tsp-portfolio');
  const [signalFilter, setSignalFilter] = useState('ALL');

  if (loading && !data) return <LoadingView label="Scanning registry" />;
  if (error && !data) return <ErrorView message={error} onRetry={refetch} />;
  if (!data) return null;

  const portfolio = data.portfolio || [];
  const filtered = signalFilter === 'ALL' ? portfolio : portfolio.filter((p) => p.trade_signal === signalFilter);

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

      {filtered.length === 0 ? (
        <EmptyView message="No candidates match this filter." />
      ) : (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Group</th>
                <th>Sector</th>
                <th>Spot</th>
                <th>Strike</th>
                <th>Delta</th>
                <th>DTE</th>
                <th>Mid</th>
                <th>Ann. Yield</th>
                <th>Collateral</th>
                <th>Contracts</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.ticker} title={p.trade_signal_reason}>
                  <td className={styles.ticker}>{p.ticker}</td>
                  <td>{p.group}</td>
                  <td className={p.sector ? '' : tableStyles.muted}>{p.sector || 'Untracked'}</td>
                  <td className="num">{p.spot_price?.toFixed(2)}</td>
                  <td className="num">{p.selected_strike?.toFixed(2)}</td>
                  <td className="num">{p.actual_delta?.toFixed(3)}</td>
                  <td className="num">{p.days_to_expiration}</td>
                  <td className="num">{p.mid?.toFixed(2)}</td>
                  <td className="num">{p.annualized_yield_pct?.toFixed(1)}%</td>
                  <td className="num">{formatCurrency(p.collateral_required)}</td>
                  <td className="num">{p.recommended_contracts}</td>
                  <td>
                    <TradeSignalBadge signal={p.trade_signal} />
                  </td>
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
