import { useMemo, useState } from 'react';
import { evaluateCreditSpread } from '../lib/creditSpreadEval';
import { formatCurrency } from '../components/SummaryBar';
import CreditSpreadEvalChart from '../components/CreditSpreadEvalChart';
import VerdictBadge from '../components/VerdictBadge';
import { EmptyView } from '../components/StateViews';
import styles from './CreditSpreadEvalPage.module.css';

// docs/credit_eval.md - a standalone, chain-free pre-trade screener for
// put credit spreads. Same category as Evaluate BWB Trades (no
// persistence, no Schwab dependency, pure client-side calculator -
// lib/creditSpreadEval.js), but probability-weighted (Black-Scholes
// prob_itm_at_expiration, reused from lib/blackScholes.js) rather than
// width-only - a spread can pass a width threshold and still carry
// negative expected value if the short strike is priced too close to
// the money, which is exactly what the primary verdict here catches.
const EMPTY_FORM = {
  ticker: '', shortStrike: '', longStrike: '', netCreditPerShare: '',
  contracts: '1', currentSpot: '', iv: '', dte: '',
};

function parseNum(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export default function CreditSpreadEvalPage() {
  const [form, setForm] = useState(EMPTY_FORM);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const result = useMemo(() => {
    const shortStrike = parseNum(form.shortStrike);
    const longStrike = parseNum(form.longStrike);
    const netCreditPerShare = parseNum(form.netCreditPerShare);
    const contracts = parseNum(form.contracts) || 1;
    const currentSpot = parseNum(form.currentSpot);
    const iv = parseNum(form.iv);
    const dte = parseNum(form.dte);

    const ready = [shortStrike, longStrike, netCreditPerShare, currentSpot, dte].every((v) => v !== null);
    if (!ready) return null;

    return evaluateCreditSpread({ shortStrike, longStrike, netCreditPerShare, contracts, currentSpot, iv, dte });
  }, [form]);

  return (
    <div>
      <h1 className={styles.title}>Evaluate Credit Spreads</h1>

      <p className={styles.intro}>
        Pre-trade screening for a proposed put credit spread - enter candidate strikes, net credit, current
        spot, and DTE to see the expiration P&amp;L curve and a probability-weighted expected-value verdict.
        Net-credit put spreads only. Nothing here is saved - this is evaluate-only, before any position exists.
      </p>

      <div className={styles.form}>
        <div className={styles.formRow}>
          <input placeholder="Ticker (optional)" value={form.ticker} onChange={(e) => update('ticker', e.target.value)} className={styles.formInput} />
          <input placeholder="Contracts" type="number" min="1" value={form.contracts} onChange={(e) => update('contracts', e.target.value)} className={styles.formInputSmall} />
          <input placeholder="Current Spot" type="number" step="0.01" value={form.currentSpot} onChange={(e) => update('currentSpot', e.target.value)} className={styles.formInputSmall} />
          <input placeholder="DTE" type="number" min="1" value={form.dte} onChange={(e) => update('dte', e.target.value)} className={styles.formInputSmall} />
          <input placeholder="IV (decimal, e.g. 0.30)" type="number" step="0.01" value={form.iv} onChange={(e) => update('iv', e.target.value)} className={styles.formInputSmall} />
        </div>
        <div className={styles.formRow}>
          <label className={styles.legLabel}>
            Short Strike (sold)
            <input placeholder="Strike" type="number" step="0.01" value={form.shortStrike} onChange={(e) => update('shortStrike', e.target.value)} className={styles.formInputSmall} />
          </label>
          <label className={styles.legLabel}>
            Long Strike (bought)
            <input placeholder="Strike" type="number" step="0.01" value={form.longStrike} onChange={(e) => update('longStrike', e.target.value)} className={styles.formInputSmall} />
          </label>
          <label className={styles.legLabel}>
            Net Credit (per share)
            <input placeholder="e.g. 1.25" type="number" step="0.01" value={form.netCreditPerShare} onChange={(e) => update('netCreditPerShare', e.target.value)} className={styles.formInputSmall} />
          </label>
        </div>
      </div>

      {!result && <EmptyView message="Enter both strikes, net credit, current spot, and DTE to evaluate. IV defaults to 30% if left blank." />}

      {result && !result.valid && (
        <div className={styles.errorsNote}>
          <strong>Can't evaluate this structure:</strong>
          <ul>
            {result.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {result && result.valid && (
        <>
          <div className={styles.reportCard}>
            <VerdictBadge verdict={result.verdict} />
            <div className={styles.reportGrid}>
              <div>
                <span className={styles.reportLabel}>Expected Value</span>
                <span className={result.totalExpectedValue >= 0 ? styles.reportValuePositive : styles.reportValueNegative}>
                  {formatCurrency(result.totalExpectedValue)}
                </span>
              </div>
              <div>
                <span className={styles.reportLabel}>Max Profit</span>
                <span className={styles.reportValuePositive}>{formatCurrency(result.totalMaxProfit)}</span>
              </div>
              <div>
                <span className={styles.reportLabel}>Max Loss</span>
                <span className={styles.reportValueNegative}>-{formatCurrency(result.totalMaxLoss)}</span>
              </div>
              <div>
                <span className={styles.reportLabel}>Breakeven</span>
                <span className={styles.reportValue}>${result.breakeven.toFixed(2)}</span>
              </div>
              <div>
                <span className={styles.reportLabel}>Return on Risk</span>
                <span className={styles.reportValue}>
                  {result.returnOnRiskPct.toFixed(1)}%
                  <span className={styles.reportSub}> (ref. {result.referenceRorThresholdPct.toFixed(0)}%)</span>
                </span>
              </div>
              <div>
                <span className={styles.reportLabel}>Reward : Risk</span>
                <span className={styles.reportValue}>{result.rewardToRiskRatio.toFixed(2)} : 1</span>
              </div>
              <div>
                <span className={styles.reportLabel}>Prob. Max Profit</span>
                <span className={styles.reportValue}>{(result.probMaxProfit * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className={styles.reportLabel}>Prob. Max Loss</span>
                <span className={styles.reportValue}>{(result.probMaxLoss * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className={styles.reportLabel}>Prob. Partial</span>
                <span className={styles.reportValue}>{(result.probPartial * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

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
        </>
      )}
    </div>
  );
}
