import { useState } from 'react';
import { getCspScan } from '../api/client';
import { useSortableData } from '../lib/useSortableData';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import TradeSignalBadge from '../components/TradeSignalBadge';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import tableStyles from '../components/Table.module.css';
import styles from './CspScanPage.module.css';

const DEFAULTS = { ticker: '', minDelta: 0.1, maxDelta: 0.25, minDte: 21, maxDte: 60, includeIlliquid: false };

// Same column-definition pattern as TspScanPage/PositionsPage - one
// source of truth driving both the column picker and the sort logic.
const COLUMNS = [
  { key: 'expiration_date', label: 'Expiration', alwaysVisible: true, sortable: true, getSortValue: (c) => c.expiration_date,
    render: (c) => c.expiration_date },
  { key: 'days_to_expiration', label: 'DTE', sortable: true, getSortValue: (c) => c.days_to_expiration,
    render: (c) => c.days_to_expiration },
  { key: 'strike', label: 'Strike', sortable: true, getSortValue: (c) => c.strike,
    render: (c) => c.strike?.toFixed(2) },
  { key: 'delta', label: 'Delta', sortable: true, getSortValue: (c) => c.delta,
    render: (c) => c.delta?.toFixed(3) },
  { key: 'bid', label: 'Bid', sortable: true, getSortValue: (c) => c.bid,
    render: (c) => c.bid?.toFixed(2) },
  { key: 'ask', label: 'Ask', sortable: true, getSortValue: (c) => c.ask,
    render: (c) => c.ask?.toFixed(2) },
  { key: 'mid', label: 'Mid', sortable: true, getSortValue: (c) => c.mid,
    render: (c) => c.mid?.toFixed(2) },
  { key: 'iv_pct', label: 'IV', sortable: true, getSortValue: (c) => c.iv_pct,
    render: (c) => (c.iv_pct !== null && c.iv_pct !== undefined ? `${c.iv_pct.toFixed(1)}%` : '—') },
  { key: 'open_interest', label: 'OI', sortable: true, getSortValue: (c) => c.open_interest,
    render: (c) => c.open_interest ?? '—' },
  { key: 'volume', label: 'Volume', sortable: true, getSortValue: (c) => c.volume,
    render: (c) => c.volume ?? '—' },
  { key: 'annualized_yield_pct', label: 'Ann. Yield', sortable: true, getSortValue: (c) => c.annualized_yield_pct,
    render: (c) => (c.annualized_yield_pct !== null && c.annualized_yield_pct !== undefined ? `${c.annualized_yield_pct.toFixed(1)}%` : '—') },
  { key: 'trade_signal', label: 'Signal', sortable: true, getSortValue: (c) => c.trade_signal,
    render: (c) => <TradeSignalBadge signal={c.trade_signal} /> },
  { key: 'trade_signal_reason', label: 'Reason', sortable: true, getSortValue: (c) => c.trade_signal_reason || '',
    render: (c) => c.trade_signal_reason },
];

const NON_NUMERIC_COLUMNS = ['expiration_date', 'trade_signal', 'trade_signal_reason'];

export default function CspScanPage() {
  const [form, setForm] = useState(DEFAULTS);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'cspScanTable');
  const candidates = data?.candidates || [];
  const { sorted, sortKey, direction, requestSort } = useSortableData(
    candidates,
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.ticker.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const result = await getCspScan(form.ticker.trim().toUpperCase(), {
        minDelta: form.minDelta,
        maxDelta: form.maxDelta,
        minDte: form.minDte,
        maxDte: form.maxDte,
        includeIlliquid: form.includeIlliquid,
      });
      setData(result);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="ticker">Ticker</label>
          <input
            id="ticker"
            type="text"
            placeholder="e.g. ARKK"
            value={form.ticker}
            onChange={(e) => updateField('ticker', e.target.value)}
            className={styles.tickerInput}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="min-delta">Min Δ</label>
          <input
            id="min-delta"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={form.minDelta}
            onChange={(e) => updateField('minDelta', Number(e.target.value))}
            className={styles.numberInput}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="max-delta">Max Δ</label>
          <input
            id="max-delta"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={form.maxDelta}
            onChange={(e) => updateField('maxDelta', Number(e.target.value))}
            className={styles.numberInput}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="min-dte">Min DTE</label>
          <input
            id="min-dte"
            type="number"
            min="0"
            value={form.minDte}
            onChange={(e) => updateField('minDte', Number(e.target.value))}
            className={styles.numberInput}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="max-dte">Max DTE</label>
          <input
            id="max-dte"
            type="number"
            min="0"
            value={form.maxDte}
            onChange={(e) => updateField('maxDte', Number(e.target.value))}
            className={styles.numberInput}
          />
        </div>
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={form.includeIlliquid}
            onChange={(e) => updateField('includeIlliquid', e.target.checked)}
          />
          Include illiquid
        </label>
        <button type="submit" className={styles.scanButton} disabled={!form.ticker.trim()}>
          Scan
        </button>
      </form>

      {loading && <LoadingView label={`Scanning ${form.ticker.toUpperCase()}`} />}
      {error && <ErrorView message={error} />}

      {!loading && !error && hasSearched && data && (
        <>
          <div className={styles.contextRow}>
            <span>
              Spot: <span className="num">{data.spot_price?.toFixed(2)}</span>
            </span>
            <span>
              RSI(14): <span className="num">{data.underlying_rsi_14?.toFixed(1)}</span>
            </span>
            <span>
              SMA 50: <span className="num">{data.sma_50?.toFixed(2)}</span>
            </span>
            <span>
              SMA 200: <span className="num">{data.sma_200?.toFixed(2)}</span>
            </span>
            <span>
              Realized Vol: <span className="num">{data.realized_vol_20d_pct?.toFixed(1)}%</span>
            </span>
          </div>

          {sorted.length === 0 ? (
            <EmptyView message="No candidates found in this delta/DTE range." />
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
                    {sorted.map((c, i) => (
                      <tr
                        key={`${c.expiration_date}-${c.strike}-${i}`}
                        className={c.is_liquid === false ? styles.illiquidRow : ''}
                      >
                        {visibleColumns.map((col) => (
                          <td
                            key={col.key}
                            className={
                              col.key === 'trade_signal_reason'
                                ? tableStyles.wrapCell
                                : NON_NUMERIC_COLUMNS.includes(col.key) ? '' : 'num'
                            }
                          >
                            {col.render(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {!hasSearched && !loading && (
        <EmptyView message="Enter a ticker above to browse available strikes - no need to add it to your registry first." />
      )}
    </div>
  );
}