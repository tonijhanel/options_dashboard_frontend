import { useMemo, useState } from 'react';
import { evaluateBwb } from '../lib/bwbEval';
import { formatCurrency } from '../components/SummaryBar';
import BwbEvalChart from '../components/BwbEvalChart';
import BwbVerdictBadge from '../components/BwbVerdictBadge';
import { EmptyView } from '../components/StateViews';
import styles from './BwbEvalPage.module.css';

// docs/bwb_eval.md - a standalone, chain-free pre-trade screener for Put
// BWBs. No Schwab/Supabase dependency, no persistence - pure client-side
// calculator (lib/bwbEval.js), recomputed live on every keystroke since
// there's no round trip to wait on. Distinct from the BWB Trades page
// (Active Spreads > BWB Spreads), which records positions AFTER entry.
const EMPTY_FORM = {
  ticker: '', longLowStrike: '', shortMidStrike: '', longHighStrike: '',
  netCreditPerShare: '', contracts: '1', currentSpot: '',
};

function parseNum(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export default function BwbEvalPage() {
  const [form, setForm] = useState(EMPTY_FORM);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const result = useMemo(() => {
    const longLowStrike = parseNum(form.longLowStrike);
    const shortMidStrike = parseNum(form.shortMidStrike);
    const longHighStrike = parseNum(form.longHighStrike);
    const netCreditPerShare = parseNum(form.netCreditPerShare);
    const contracts = parseNum(form.contracts) || 1;
    const currentSpot = parseNum(form.currentSpot);

    const ready = [longLowStrike, shortMidStrike, longHighStrike, netCreditPerShare].every((v) => v !== null);
    if (!ready) return null;

    return evaluateBwb({ longLowStrike, shortMidStrike, longHighStrike, netCreditPerShare, contracts, currentSpot });
  }, [form]);

  return (
    <div>
      <h1 className={styles.title}>Evaluate BWB Trades</h1>

      <p className={styles.intro}>
        Pre-trade screening for a proposed Put Broken Wing Butterfly - enter candidate strikes and the net
        credit to see the expiration P&amp;L curve and whether the premium collected is sufficient for the
        risk taken. Net-credit structures only. Nothing here is saved - this is evaluate-only, before any
        position exists.
      </p>

      <div className={styles.form}>
        <div className={styles.formRow}>
          <input placeholder="Ticker (optional)" value={form.ticker} onChange={(e) => update('ticker', e.target.value)} className={styles.formInput} />
          <input placeholder="Contracts" type="number" min="1" value={form.contracts} onChange={(e) => update('contracts', e.target.value)} className={styles.formInputSmall} />
          <input placeholder="Current Spot (optional)" type="number" step="0.01" value={form.currentSpot} onChange={(e) => update('currentSpot', e.target.value)} className={styles.formInputSmall} />
        </div>
        <div className={styles.formRow}>
          <label className={styles.legLabel}>
            Long Wing (Low)
            <input placeholder="Strike" type="number" step="0.01" value={form.longLowStrike} onChange={(e) => update('longLowStrike', e.target.value)} className={styles.formInputSmall} />
          </label>
          <label className={styles.legLabel}>
            Short Middle (x2)
            <input placeholder="Strike" type="number" step="0.01" value={form.shortMidStrike} onChange={(e) => update('shortMidStrike', e.target.value)} className={styles.formInputSmall} />
          </label>
          <label className={styles.legLabel}>
            Long Wing (High)
            <input placeholder="Strike" type="number" step="0.01" value={form.longHighStrike} onChange={(e) => update('longHighStrike', e.target.value)} className={styles.formInputSmall} />
          </label>
          <label className={styles.legLabel}>
            Net Credit (per share)
            <input placeholder="e.g. 1.25" type="number" step="0.01" value={form.netCreditPerShare} onChange={(e) => update('netCreditPerShare', e.target.value)} className={styles.formInputSmall} />
          </label>
        </div>
      </div>

      {!result && <EmptyView message="Enter all three strikes and the net credit to evaluate." />}

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
            <BwbVerdictBadge verdict={result.verdict} />
            <div className={styles.reportGrid}>
              <div>
                <span className={styles.reportLabel}>Max Profit</span>
                <span className={styles.reportValuePositive}>{formatCurrency(result.totalMaxProfit)}</span>
              </div>
              <div>
                <span className={styles.reportLabel}>{result.isRiskFree ? 'Guaranteed Minimum Profit' : 'Max Loss'}</span>
                <span className={result.isRiskFree ? styles.reportValueAccent : styles.reportValueNegative}>
                  {result.isRiskFree ? formatCurrency(result.guaranteedProfit) : `-${formatCurrency(result.totalMaxLoss)}`}
                </span>
              </div>
              <div>
                <span className={styles.reportLabel}>Downside Breakeven</span>
                <span className={styles.reportValue}>
                  {result.isRiskFree ? 'None - profitable at every price' : `$${result.downsideBreakeven.toFixed(2)}`}
                </span>
              </div>
              <div>
                <span className={styles.reportLabel}>Reward : Risk</span>
                <span className={styles.reportValue}>
                  {result.isRiskFree ? 'N/A (risk-free)' : `${result.rewardToRiskRatio.toFixed(2)} : 1`}
                </span>
              </div>
            </div>
          </div>

          <BwbEvalChart
            curve={result.curve}
            longLowStrike={result.longLowStrike}
            shortMidStrike={result.shortMidStrike}
            longHighStrike={result.longHighStrike}
            currentSpot={result.currentSpot}
            spotPnl={result.spotPnl}
            totalMaxProfit={result.totalMaxProfit}
            totalMaxLoss={result.totalMaxLoss}
            guaranteedProfit={result.guaranteedProfit}
            downsideBreakeven={result.downsideBreakeven}
            isRiskFree={result.isRiskFree}
          />
        </>
      )}
    </div>
  );
}
