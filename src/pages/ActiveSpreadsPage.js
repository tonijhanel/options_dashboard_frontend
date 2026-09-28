import { useEffect, useMemo, useState } from 'react';
import { getActiveSpreads, updatePositionLogEntry, getIgnoredPositions, ignorePosition, unignorePosition, getLiquidityStatus } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { useSortableData } from '../lib/useSortableData';
import { pctOfMaxProfitCaptured, profitCaptureStatus } from '../lib/profitCaptured';
import { evaluateCreditSpread, verticalSpreadMaxLoss } from '../lib/creditSpreadEval';
import { combineCurves, curveValueAt } from '../lib/calendarEval';
import { computeDTE } from '../lib/dte';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import SummaryBar, { formatCurrency } from '../components/SummaryBar';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import LiquidityBadge from '../components/LiquidityBadge';
import StatusBadge from '../components/StatusBadge';
import ProfitTargetSlider from '../components/ProfitTargetSlider';
import CreditSpreadEvalChart from '../components/CreditSpreadEvalChart';
import CombinedSpreadChart from '../components/CombinedSpreadChart';
import tableStyles from '../components/Table.module.css';
import styles from './ActiveSpreadsPage.module.css';

const LIQUIDITY_RANK = { critical: 0, warning: 1, ok: 2 };
const STATUS_RANK = { 'take-profit': 0, 'roll-hold': 1 };

// Days between today and the row's own expiration - the Credit Spread
// Evaluator's math (lib/creditSpreadEval.js) needs SOME dte to run its
// probability/EV calc, even though the at-expiration curve itself
// (all this panel actually displays) doesn't depend on it at all.
// Floored at 1 so an expiration-day position doesn't fail validation.
function daysToExpiration(expiration) {
  if (!expiration) return null;
  const ms = new Date(expiration) - new Date();
  return Math.max(1, Math.ceil(ms / 86400000));
}

// Reuses the standalone Credit Spread Evaluator's own math/chart
// (lib/creditSpreadEval.js, CreditSpreadEvalChart.js) fed from this
// ALREADY-OPEN position's real strikes/credit/contracts instead of a
// hand-typed hypothetical - at-expiration payoff shape only ("Tier 1"
// scope, 2026-08). iv is left unspecified (defaults to 30% inside the
// evaluator) and only feeds the probability/EV numbers this panel
// doesn't show - live IV per leg isn't fetched anywhere on this page,
// so those numbers would be misleading if displayed; the curve itself
// doesn't use iv/dte at all.
function SpreadChartPanel({ row }) {
  const result = evaluateCreditSpread({
    shortStrike: row.short_strike,
    longStrike: row.long_strike,
    netCreditPerShare: row.net_entry,
    contracts: row.contracts,
    currentSpot: row.spot_price,
    dte: daysToExpiration(row.expiration),
    optionType: row.option_type,
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
        Max Profit <strong className={tableStyles.positive}>{formatCurrency(result.totalMaxProfit)}</strong>
        {' · '}
        Max Loss <strong className={tableStyles.negative}>-{formatCurrency(result.totalMaxLoss)}</strong>
        {' · '}
        Breakeven <strong>${result.breakeven.toFixed(2)}</strong>
      </p>
      <CreditSpreadEvalChart
        curve={result.curve}
        shortStrike={result.shortStrike}
        longStrike={result.longStrike}
        currentSpot={result.currentSpot}
        spotPnl={result.spotPnl}
        totalMaxProfit={result.totalMaxProfit}
        totalMaxLoss={result.totalMaxLoss}
        breakeven={result.breakeven}
      />
    </div>
  );
}

// Iron condor combined view - shown ALONGSIDE (not instead of) each leg's
// own individual SpreadChartPanel above, same relationship as the
// Calendar Spreads page's CombinedCalendarChartPanel to its own two
// single-leg panels. Sums the put spread's and call spread's independent
// expiration curves onto one shared price range via lib/calendarEval's
// combineCurves/curveValueAt - generic curve utilities, not calendar-
// specific despite living in that file (CalendarSpreadsPage already
// reuses them the same way for its own combined view).
//
// Combined max profit is just the sum of both legs' own max profit (spot
// CAN sit between both short strikes, putting both legs at max profit
// simultaneously) - but combined max loss is NOT the sum of both legs'
// own max loss (spot can only land in ONE leg's loss zone at expiration,
// never both), so it's computed the same way as ActiveSpreadsPage's own
// row-grouping correction: the wider leg's width minus both legs'
// combined credit, not each leg's max loss added together.
function CombinedIronCondorChartPanel({ rowA, rowB }) {
  const resultA = evaluateCreditSpread({
    shortStrike: rowA.short_strike, longStrike: rowA.long_strike, netCreditPerShare: rowA.net_entry,
    contracts: rowA.contracts, currentSpot: rowA.spot_price, dte: daysToExpiration(rowA.expiration),
    optionType: rowA.option_type,
  });
  const resultB = evaluateCreditSpread({
    shortStrike: rowB.short_strike, longStrike: rowB.long_strike, netCreditPerShare: rowB.net_entry,
    contracts: rowB.contracts, currentSpot: rowB.spot_price, dte: daysToExpiration(rowB.expiration),
    optionType: rowB.option_type,
  });

  if (!resultA.valid || !resultB.valid) {
    return (
      <div className={styles.chartPanel}>
        <p className={styles.chartError}>Can't chart the combined view: {[...resultA.errors, ...resultB.errors].join(' ')}</p>
      </div>
    );
  }

  const putResult = resultA.optionType === 'PUT' ? resultA : resultB;
  const callResult = resultA.optionType === 'CALL' ? resultA : resultB;

  const combined = combineCurves(resultA.curve, resultB.curve);
  const spot = rowA.spot_price || rowB.spot_price || null;
  const spotPnl = spot ? curveValueAt(combined, spot) : null;
  const combinedMaxProfit = resultA.totalMaxProfit + resultB.totalMaxProfit;
  const combinedMaxLoss = Math.max(resultA.width, resultB.width) * 100 * resultA.contracts
    - (resultA.netCreditPerShare + resultB.netCreditPerShare) * 100 * resultA.contracts;

  return (
    <div className={styles.chartPanel}>
      <p className={styles.chartSummary}>
        Combined Max Profit <strong className={tableStyles.positive}>{formatCurrency(combinedMaxProfit)}</strong>
        {' · '}
        Combined Max Loss <strong className={tableStyles.negative}>-{formatCurrency(combinedMaxLoss)}</strong>
      </p>
      <CombinedSpreadChart
        curve={combined}
        putShortStrike={putResult.shortStrike}
        putLongStrike={putResult.longStrike}
        callShortStrike={callResult.shortStrike}
        callLongStrike={callResult.longStrike}
        currentSpot={spot}
        spotPnl={spotPnl}
        totalMaxProfit={combinedMaxProfit}
        totalMaxLoss={combinedMaxLoss}
      />
    </div>
  );
}

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

// Manual per-position exclusion (2026-07-23) - a spread is a DIFFERENT
// pipeline from the naked-put Positions page (this page reads already-
// logged position_log rows, not live SnapTrade detection directly), so
// it needs its own Ignore button hitting the same /ignored-positions
// endpoint with strike=short_strike - see
// docs/supabase_migration_ignored_positions_spreads.sql.
function IgnoreButton({ row, onIgnored }) {
  const [ignoring, setIgnoring] = useState(false);
  const [error, setError] = useState(null);

  async function handleIgnore() {
    setIgnoring(true);
    setError(null);
    try {
      await ignorePosition({
        ticker: row.ticker,
        strike: row.short_strike,
        long_strike: row.long_strike,
        expiration: row.expiration,
        contracts: row.contracts,
      });
      onIgnored();
    } catch (e) {
      setError(e.message);
    } finally {
      setIgnoring(false);
    }
  }

  return (
    <span className={styles.ignoreCell}>
      <button className={styles.ignoreButton} onClick={handleIgnore} disabled={ignoring}>
        {ignoring ? 'Ignoring…' : 'Ignore'}
      </button>
      {error && <span className={styles.ignoreError}>{error}</span>}
    </span>
  );
}

// Same column-definition pattern as PositionsPage/TspScanPage - one source
// of truth driving both the column picker and the sort logic.
const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker,
    render: (r) => <span className={styles.ticker}>{r.ticker}</span> },
  { key: 'spot_price', label: 'Spot', sortable: true, getSortValue: (r) => r.spot_price,
    render: (r) => (r.spot_price != null ? r.spot_price.toFixed(2) : '—') },
  { key: 'short_strike', label: 'Short Strike', sortable: true, getSortValue: (r) => r.short_strike,
    render: (r) => r.short_strike?.toFixed(2) },
  { key: 'long_strike', label: 'Long Strike', sortable: true, getSortValue: (r) => r.long_strike,
    render: (r) => r.long_strike?.toFixed(2) },
  { key: 'break_even', label: 'Break Even', sortable: true, getSortValue: (r) => r.break_even,
    render: (r) => (r.break_even != null ? r.break_even.toFixed(2) : '—') },
  { key: 'expiration', label: 'Expiration', sortable: true, getSortValue: (r) => r.expiration,
    render: (r) => r.expiration },
  { key: 'dte', label: 'DTE', sortable: true, getSortValue: (r) => computeDTE(r.expiration),
    render: (r) => computeDTE(r.expiration) },
  { key: 'contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.contracts,
    render: (r) => r.contracts },
  { key: 'net_entry', label: 'Net Entry', sortable: true, getSortValue: (r) => r.net_entry,
    render: (r) => (r.net_entry != null ? r.net_entry.toFixed(2) : '—') },
  { key: 'current_net_value', label: 'Current Net Value', sortable: true, getSortValue: (r) => r.current_net_value,
    render: (r) => (r.current_net_value != null ? r.current_net_value.toFixed(2) : '—') },
  { key: 'max_loss', label: 'Max Loss', sortable: true, getSortValue: (r) => r.maxLoss,
    render: (r) => (
      r.maxLoss != null
        ? (
          <span className={tableStyles.negative}>
            -{formatCurrency(r.maxLoss)}
            {r.isIcPair && <span title="Combined with paired IC leg - spot can only hit one leg's loss zone at expiration"> (IC)</span>}
          </span>
        )
        : '—'
    ) },
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
  { key: 'pct_captured', label: 'Profit Captured', sortable: true, getSortValue: (r) => r.pctCaptured,
    render: (r) => (
      r.pctCaptured != null
        ? <span className={r.hitProfitTarget ? tableStyles.positive : ''}>{r.pctCaptured.toFixed(0)}%</span>
        : '—'
    ) },
  { key: 'status', label: 'Status', sortable: true,
    getSortValue: (r) => STATUS_RANK[r.status?.tone] ?? 2,
    render: (r) => (r.status ? <StatusBadge status={r.status} /> : '—') },
  { key: 'liquidity', label: 'Liquidity', sortable: true,
    getSortValue: (r) => LIQUIDITY_RANK[r.liquidity?.severity] ?? 3,
    render: (r) => <LiquidityBadge snapshot={r.liquidity} /> },
];

const NON_NUMERIC_COLUMNS = ['ticker', 'expiration', 'status', 'liquidity'];

export default function ActiveSpreadsPage() {
  const { data, error, loading, refetch } = useApiData(getActiveSpreads, 'activeSpreads');
  const { data: ignoredPositions, refetch: refetchIgnored } = useApiData(getIgnoredPositions, 'ignoredPositions');
  const { data: liquidityStatus } = useApiData(getLiquidityStatus, 'liquidityStatus');
  const [profitTarget, setProfitTarget] = useState(80);
  const [selectedId, setSelectedId] = useState(null);

  // Keyed by position_id (docs/liquiddecay.md) - every position_log row's
  // own id, regardless of position_type (naked_put, vertical_spread,
  // bwb_put all key their liquidity_snapshots the same way - see
  // services/liquidity_monitor.py's module docstring for why this is
  // position_id, not strategy_group).
  const liquidityByPosition = useMemo(() => {
    const map = {};
    (liquidityStatus?.results || []).forEach((snapshot) => {
      map[snapshot.position_id] = snapshot;
    });
    return map;
  }, [liquidityStatus]);

  const spreads = useMemo(() => {
    const rows = (data?.spreads || []).map((r) => {
      // A credit vertical has no separate max_profit field - the entry
      // credit itself IS the max profit, realized when current_net_value
      // decays to 0 (see lib/profitCaptured.js).
      const maxProfitDollars = r.net_entry != null ? r.net_entry * 100 * r.contracts : null;
      const pctCaptured = pctOfMaxProfitCaptured(r.live_pnl, maxProfitDollars);
      const { totalMaxLoss } = verticalSpreadMaxLoss({
        shortStrike: r.short_strike, longStrike: r.long_strike,
        netCreditPerShare: r.net_entry, contracts: r.contracts,
      });
      return {
        ...r,
        liquidity: liquidityByPosition[r.id],
        pctCaptured,
        hitProfitTarget: pctCaptured != null && pctCaptured >= profitTarget,
        status: profitCaptureStatus(pctCaptured, profitTarget),
        maxLoss: totalMaxLoss,
        isIcPair: false,
      };
    });

    // Iron condor correction: a put spread and a call spread sharing a
    // strategy_group (SnapTrade auto-detection's own IC tag, see
    // snaptrade_client.parse_short_put_positions) can never both hit max
    // loss at once - spot lands in exactly one leg's loss zone at
    // expiration - so summing each leg's own standalone maxLoss above
    // double-counts the real risk. Replace both legs' maxLoss with the
    // correct combined figure: the wider leg's width minus BOTH legs'
    // combined credit. Only applied when exactly 2 rows share the group,
    // they're opposite option_types (a real put+call pair, not a
    // coincidental tag collision), and contract counts match - anything
    // else falls back to each leg's standalone number rather than
    // guessing at a combination that may not be apples-to-apples.
    const byGroup = {};
    rows.forEach((r) => {
      if (r.strategy_group) (byGroup[r.strategy_group] ||= []).push(r);
    });
    Object.values(byGroup).forEach((group) => {
      if (group.length !== 2) return;
      const [a, b] = group;
      if (a.option_type === b.option_type) return;
      if ((a.contracts || 0) !== (b.contracts || 0)) return;
      const widthA = Math.abs((a.short_strike || 0) - (a.long_strike || 0));
      const widthB = Math.abs((b.short_strike || 0) - (b.long_strike || 0));
      const combinedCredit = (a.net_entry || 0) + (b.net_entry || 0);
      const combinedMaxLoss = (Math.max(widthA, widthB) - combinedCredit) * 100 * a.contracts;
      a.maxLoss = combinedMaxLoss;
      b.maxLoss = combinedMaxLoss;
      a.isIcPair = true;
      b.isIcPair = true;
    });

    return rows;
  }, [data, liquidityByPosition, profitTarget]);
  const totalLivePnl = useMemo(
    () => spreads.reduce((sum, r) => sum + (r.live_pnl || 0), 0),
    [spreads]
  );
  // Collateral Allocated - same tile as the CSP/Positions page's "Total
  // Collateral Utilized", but scoped to vertical spreads. Sums each row's
  // (IC-corrected) maxLoss, deduping paired IC legs down to ONE
  // contribution per strategy_group rather than counting the same
  // combined figure twice (both legs carry it for per-row display).
  const totalCollateral = useMemo(() => {
    const seenGroups = new Set();
    return spreads.reduce((sum, r) => {
      if (r.isIcPair) {
        if (seenGroups.has(r.strategy_group)) return sum;
        seenGroups.add(r.strategy_group);
      }
      return sum + (r.maxLoss || 0);
    }, 0);
  }, [spreads]);
  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'activeSpreadsTable');
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    spreads,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  useEffect(() => {
    if (!selectedId && sorted.length > 0) {
      setSelectedId(sorted[0].id);
    }
  }, [sorted, selectedId]);

  const selected = sorted.find((r) => r.id === selectedId);

  // The selected row's iron-condor partner, if any - only when the
  // strategy_group grouping above qualified it as a real put+call pair
  // (isIcPair), not just any two rows that happen to share a tag.
  const combinedPartner = useMemo(() => {
    if (!selected?.isIcPair) return null;
    return sorted.find((r) => r.id !== selected.id && r.strategy_group === selected.strategy_group) || null;
  }, [selected, sorted]);

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

      <SummaryBar
        items={[
          {
            label: 'Current Profit/Loss',
            value: totalLivePnl,
            sub: 'Live P&L for open vertical spreads only',
            subTone: totalLivePnl >= 0 ? 'positive' : undefined,
          },
          {
            label: 'Collateral Allocated',
            value: totalCollateral,
            sub: 'Max loss at risk across open vertical spreads - iron condor legs counted once',
          },
        ]}
      />

      {sorted.length === 0 ? (
        <EmptyView message="No open vertical spreads right now." />
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
                      <SpreadRowActions row={r} onClosed={refetch} />
                      <IgnoreButton row={r} onIgnored={() => { refetch(); refetchIgnored(); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <>
              <div className={styles.selectorRow}>
                <label htmlFor="spread-select" className={styles.selectorLabel}>
                  Chart - click a row above, or select here:
                </label>
                <select
                  id="spread-select"
                  className={styles.selector}
                  value={selectedId || ''}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                >
                  {sorted.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ticker} {r.short_strike}/{r.long_strike} exp {r.expiration}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.detailCard}>
                <h2 className={styles.chartTitle}>
                  P&amp;L Chart for {selected.ticker} {selected.short_strike}/{selected.long_strike}
                </h2>
                <SpreadChartPanel row={selected} />
              </div>

              {combinedPartner && (
                <div className={styles.detailCard}>
                  <h2 className={styles.chartTitle}>
                    Combined Iron Condor: {selected.strategy_group}
                  </h2>
                  <CombinedIronCondorChartPanel rowA={selected} rowB={combinedPartner} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {data._error && (
        <div className={styles.errorsNote}>
          <strong>Some spreads may be missing or incomplete:</strong>
          <p>{data._error}</p>
        </div>
      )}

      {ignoredPositions?.results?.length > 0 && (
        <div className={styles.errorsNote}>
          <strong>Ignored ({ignoredPositions.results.length}):</strong> manually hidden - clears
          automatically once the position actually closes, or un-ignore it now. Shared with the
          Positions page (naked puts and spreads use the same list).
          <ul className={styles.ignoredList}>
            {ignoredPositions.results.map((entry) => (
              <li key={entry.id}>
                {entry.ticker} ${Number(entry.strike).toFixed(2)}
                {entry.long_strike != null ? `/${Number(entry.long_strike).toFixed(2)}` : ''} exp {entry.expiration} x{entry.contracts}
                {' '}
                <button
                  className={styles.unignoreLink}
                  onClick={async () => { await unignorePosition(entry.id); refetch(); refetchIgnored(); }}
                >
                  Un-ignore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
