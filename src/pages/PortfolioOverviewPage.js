import { useState, useMemo } from 'react';
import { getPositions, getMarketCalendar } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { computeCushionPct, computeAssignmentProbPct, assignmentRiskTone } from '../lib/positionRisk';
import { useNewsSentiment } from '../lib/useNewsSentiment';
import { generatePortfolioInsights } from '../lib/portfolioInsights';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import SectorDonut from '../components/SectorDonut';
import CushionBar from '../components/CushionBar';
import InsightsList from '../components/InsightsList';
import MarketCalendarWidget from '../components/MarketCalendarWidget';
import HedgeCard from '../components/HedgeCard';
import styles from './PortfolioOverviewPage.module.css';

const SECTOR_METRICS = {
  premium: {
    label: 'Premium Value',
    description: 'Current market value of the options themselves',
    // matches dashboard.py's sector donut exactly
    getValue: (p) => Math.abs(p.contracts) * Math.abs(p.mid) * 100,
  },
  collateral: {
    label: 'Capital Allocation',
    description: 'Collateral required per sector - how much buying power is actually locked up',
    getValue: (p) => Math.abs(p.contracts) * Math.abs(p.strike) * 100,
  },
};

export default function PortfolioOverviewPage() {
  const { data, error, loading, refetch } = useApiData(getPositions, 'positions');
  const {
    data: calendar,
    error: calendarError,
    loading: calendarLoading,
    refetch: refetchCalendar,
  } = useApiData(getMarketCalendar, 'marketCalendar');
  const { getEntry: getNewsEntry } = useNewsSentiment();
  const [metric, setMetric] = useState('premium');

  const sectorData = useMemo(() => {
    if (!data?.positions) return [];
    const getValue = SECTOR_METRICS[metric].getValue;
    const bySector = {};
    for (const p of data.positions) {
      const sector = p.sector || 'Untracked';
      bySector[sector] = (bySector[sector] || 0) + getValue(p);
    }
    return Object.entries(bySector).map(([name, value]) => ({ name, value }));
  }, [data, metric]);

  const insights = useMemo(() => {
    if (!data?.positions) return [];
    return generatePortfolioInsights(data.positions);
  }, [data]);

  const positions = data?.positions || [];
  const showCalendarInRow = data && positions.length > 0;

  const calendarSection = (
    <>
      <h2 className={styles.sectionTitle}>Market Calendar</h2>
      {calendarLoading && !calendar && <LoadingView label="Loading market calendar" />}
      {calendarError && !calendar && <ErrorView message={calendarError} onRetry={refetchCalendar} />}
      {calendar && <MarketCalendarWidget calendar={calendar} />}
    </>
  );

  return (
    <div>
      <PageHeader title="Portfolio Overview" onRefresh={refetch} refreshing={loading} />

      {!showCalendarInRow && <section className={styles.section}>{calendarSection}</section>}

      <HedgeCard />

      {loading && !data && <LoadingView label="Loading portfolio overview" />}
      {error && !data && <ErrorView message={error} onRetry={refetch} />}

      {data && (
        <>
          {error && <ErrorView message={error} onRetry={refetch} />}

          {positions.length === 0 ? (
            <EmptyView message="No open positions to summarize yet." />
          ) : (
            <>
              <div className={styles.topRow}>
                <section className={`${styles.section} ${styles.donutCol}`}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Portfolio Sector Concentration</h2>
                    <div className={styles.metricToggle}>
                      {Object.entries(SECTOR_METRICS).map(([key, m]) => (
                        <button
                          key={key}
                          className={metric === key ? styles.toggleActive : styles.toggle}
                          onClick={() => setMetric(key)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className={styles.metricDescription}>{SECTOR_METRICS[metric].description}</p>
                  <SectorDonut data={sectorData} />
                </section>

                <section className={`${styles.section} ${styles.calendarCol}`}>{calendarSection}</section>
              </div>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Downside Safety Cushions &amp; Assignment Risk</h2>
                {positions.map((p, i) => (
                  <CushionBar
                    key={`${p.ticker}-${p.strike}-${i}`}
                    ticker={p.ticker}
                    strike={p.strike}
                    spot={p.spot}
                    cushionPct={computeCushionPct(p.spot, p.strike)}
                    assignmentProbPct={computeAssignmentProbPct(p.spot, p.strike, p.dte, p.iv)}
                    tone={assignmentRiskTone(computeAssignmentProbPct(p.spot, p.strike, p.dte, p.iv))}
                    getNewsEntry={getNewsEntry}
                  />
                ))}
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Portfolio Insights</h2>
                <InsightsList insights={insights} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}