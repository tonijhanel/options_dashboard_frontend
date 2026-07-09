import { useState } from 'react';
import { getCspScan } from '../api/client';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import TradeSignalBadge from '../components/TradeSignalBadge';
import tableStyles from '../components/Table.module.css';
import styles from './CspScanPage.module.css';

const DEFAULTS = { ticker: '', minDelta: 0.1, maxDelta: 0.25, minDte: 21, maxDte: 60, includeIlliquid: false };

export default function CspScanPage() {
  const [form, setForm] = useState(DEFAULTS);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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

          {(!data.candidates || data.candidates.length === 0) ? (
            <EmptyView message="No candidates found in this delta/DTE range." />
          ) : (
            <div className={tableStyles.tableWrap}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Expiration</th>
                    <th>DTE</th>
                    <th>Strike</th>
                    <th>Delta</th>
                    <th>Bid</th>
                    <th>Ask</th>
                    <th>Mid</th>
                    <th>IV</th>
                    <th>OI</th>
                    <th>Volume</th>
                    <th>Ann. Yield</th>
                    <th>Signal</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((c, i) => (
                    <tr
                      key={`${c.expiration_date}-${c.strike}-${i}`}
                      className={c.is_liquid === false ? styles.illiquidRow : ''}
                    >
                      <td>{c.expiration_date}</td>
                      <td className="num">{c.days_to_expiration}</td>
                      <td className="num">{c.strike?.toFixed(2)}</td>
                      <td className="num">{c.delta?.toFixed(3)}</td>
                      <td className="num">{c.bid?.toFixed(2)}</td>
                      <td className="num">{c.ask?.toFixed(2)}</td>
                      <td className="num">{c.mid?.toFixed(2)}</td>
                      <td className="num">{c.iv_pct?.toFixed(1)}%</td>
                      <td className="num">{c.open_interest ?? '—'}</td>
                      <td className="num">{c.volume ?? '—'}</td>
                      <td className="num">{c.annualized_yield_pct?.toFixed(1)}%</td>
                      <td>
                        <TradeSignalBadge signal={c.trade_signal} />
                      </td>
                      <td className={styles.reasonCell}>{c.trade_signal_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!hasSearched && !loading && (
        <EmptyView message="Enter a ticker above to browse available strikes - no need to add it to your registry first." />
      )}
    </div>
  );
}