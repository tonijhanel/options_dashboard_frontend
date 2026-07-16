import { useState } from 'react';
import {
  getHedgeInputs, getHedgeSizing, getHedgeStatus, getHedgeSettings,
  updateHedgeSettings, createHedgePosition, closeHedgePosition,
} from '../api/client';
import { useApiData } from '../lib/useApiData';
import { formatCurrency } from './SummaryBar';
import MarkdownText from './MarkdownText';
import { LoadingView, ErrorView } from './StateViews';
import styles from './HedgeCard.module.css';

// Step 9 of docs/hedge.md, verbatim - shown as a static reference, not computed.
const CRASH_PLAYBOOK = `**If SPY gaps down 8%+:** sell the tail puts into the IV spike - don't wait for expiry.

**Evaluate the spreads:** close if near max value, hold if the slide looks ongoing.

Proceeds are earmarked for the assignments your CSPs will be taking - that's the wheel working as designed, with a cash infusion at the bottom.`;

export default function HedgeCard() {
  const { data: inputs, error: inputsError, loading: inputsLoading, refetch: refetchInputs } =
    useApiData(getHedgeInputs, 'hedgeInputs');
  const { data: status, error: statusError, loading: statusLoading, refetch: refetchStatus } =
    useApiData(getHedgeStatus, 'hedgeStatus');
  const { data: settings, refetch: refetchSettings } = useApiData(getHedgeSettings, 'hedgeSettings');

  const [recalc, setRecalc] = useState(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcError, setRecalcError] = useState(null);
  const [openForm, setOpenForm] = useState(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(null);

  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeForm, setCloseForm] = useState({ spread_close_credit: '', tail_put_close_credit: '' });
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(null);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState(null);

  async function handleRecalculate() {
    setRecalcLoading(true);
    setRecalcError(null);
    try {
      const result = await getHedgeSizing(settings?.preferred_instrument || 'SPY');
      setRecalc(result);
      setOpenForm({
        spread_entry_debit: (
          (result.pricing.layer1_long?.mid || 0) - (result.pricing.layer1_short?.mid || 0)
        ).toFixed(2),
        tail_put_entry_debit: (result.pricing.layer2_tail?.mid || 0).toFixed(2),
      });
    } catch (err) {
      setRecalcError(err.message);
    } finally {
      setRecalcLoading(false);
    }
  }

  async function handleOpenHedge(e) {
    e.preventDefault();
    if (!recalc) return;
    setOpening(true);
    setOpenError(null);
    try {
      await createHedgePosition({
        instrument: recalc.pricing.instrument,
        spread_long_strike: recalc.pricing.layer1_long.strike,
        spread_short_strike: recalc.pricing.layer1_short.strike,
        spread_contracts: recalc.sizing.spreads_needed_mid,
        spread_entry_debit: Number(openForm.spread_entry_debit),
        tail_put_strike: recalc.pricing.layer2_tail.strike,
        tail_put_contracts: recalc.sizing.tail_contracts_needed,
        tail_put_entry_debit: Number(openForm.tail_put_entry_debit),
        underlying_price_at_entry: recalc.pricing.spot_price,
      });
      setRecalc(null);
      setOpenForm(null);
      await refetchStatus();
    } catch (err) {
      setOpenError(err.message);
    } finally {
      setOpening(false);
    }
  }

  async function handleCloseHedge(e) {
    e.preventDefault();
    if (!status?.open_position) return;
    setClosing(true);
    setCloseError(null);
    try {
      await closeHedgePosition(status.open_position.id, {
        spread_close_credit: closeForm.spread_close_credit === '' ? null : Number(closeForm.spread_close_credit),
        tail_put_close_credit: closeForm.tail_put_close_credit === '' ? null : Number(closeForm.tail_put_close_credit),
      });
      setShowCloseForm(false);
      setCloseForm({ spread_close_credit: '', tail_put_close_credit: '' });
      await refetchStatus();
    } catch (err) {
      setCloseError(err.message);
    } finally {
      setClosing(false);
    }
  }

  function startEditSettings() {
    setSettingsForm({
      max_acceptable_loss: settings?.max_acceptable_loss ?? '',
      annual_hedge_budget: settings?.annual_hedge_budget ?? '',
      budget_scope: settings?.budget_scope ?? 'whole_account',
      preferred_instrument: settings?.preferred_instrument ?? 'SPY',
    });
    setSettingsError(null);
    setShowSettings(true);
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError(null);
    try {
      await updateHedgeSettings({
        max_acceptable_loss: Number(settingsForm.max_acceptable_loss),
        annual_hedge_budget: Number(settingsForm.annual_hedge_budget),
        budget_scope: settingsForm.budget_scope,
        preferred_instrument: settingsForm.preferred_instrument,
      });
      setShowSettings(false);
      await refetchSettings();
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  const openPosition = status?.open_position;
  const budgetPct = status?.budget_used_pct ?? 0;
  const barWidth = Math.min(Math.max(budgetPct, 0), 100);

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.title}>SPY/XSP Hedge</h2>
        <button className={styles.settingsButton} onClick={startEditSettings}>Settings</button>
      </div>

      {showSettings && settingsForm && (
        <form onSubmit={handleSaveSettings} className={styles.settingsForm}>
          <label>
            Max Acceptable Loss
            <input
              type="number" step="1"
              value={settingsForm.max_acceptable_loss}
              onChange={(e) => setSettingsForm((f) => ({ ...f, max_acceptable_loss: e.target.value }))}
              className={styles.settingsInput}
            />
          </label>
          <label>
            Annual Hedge Budget
            <input
              type="number" step="1"
              value={settingsForm.annual_hedge_budget}
              onChange={(e) => setSettingsForm((f) => ({ ...f, annual_hedge_budget: e.target.value }))}
              className={styles.settingsInput}
            />
          </label>
          <label>
            Budget Scope
            <select
              value={settingsForm.budget_scope}
              onChange={(e) => setSettingsForm((f) => ({ ...f, budget_scope: e.target.value }))}
              className={styles.settingsInput}
            >
              <option value="whole_account">Whole Account</option>
              <option value="csp_sleeve_only">CSP Sleeve Only</option>
            </select>
          </label>
          <label>
            Preferred Instrument
            <select
              value={settingsForm.preferred_instrument}
              onChange={(e) => setSettingsForm((f) => ({ ...f, preferred_instrument: e.target.value }))}
              className={styles.settingsInput}
            >
              <option value="SPY">SPY</option>
              <option value="XSP">XSP</option>
            </select>
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.saveButton} disabled={savingSettings}>
              {savingSettings ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={styles.cancelButton} onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
          {settingsError && <div className={styles.error}>{settingsError}</div>}
        </form>
      )}

      {(inputsLoading && !inputs) || (statusLoading && !status) ? (
        <LoadingView label="Loading hedge status" />
      ) : (
        <>
          {inputsError && !inputs && <ErrorView message={inputsError} onRetry={refetchInputs} />}
          {statusError && !status && <ErrorView message={statusError} onRetry={refetchStatus} />}

          <div className={styles.metricsRow}>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Weighted Beta</div>
              <div className={styles.metricValue}>{inputs?.weighted_beta ?? '—'}</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Weighted Avg Cushion</div>
              <div className={styles.metricValue}>
                {inputs?.weighted_avg_cushion_pct != null ? `${inputs.weighted_avg_cushion_pct.toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>
          {inputs?.missing_beta_tickers?.length > 0 && (
            <p className={styles.note}>
              No beta yet for: {inputs.missing_beta_tickers.join(', ')} - refreshes monthly, excluded from weighted beta until then.
            </p>
          )}

          <div className={styles.budgetSection}>
            <div className={styles.budgetLabel}>
              Cumulative Hedge Cost:{' '}
              <span className="num">{formatCurrency(status?.cumulative_net_cost ?? 0)}</span>
              {' '}/{' '}
              <span className="num">{formatCurrency(status?.annual_hedge_budget ?? 0)}</span> annual budget
            </div>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill} ${barWidth >= 100 ? styles.over : ''}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>

          <div className={styles.positionSection}>
            <h3 className={styles.sectionTitle}>Current Hedge</h3>
            {openPosition ? (
              <>
                <div className={styles.positionGrid}>
                  <div>
                    Spread <span className="num">${openPosition.spread_long_strike}/{openPosition.spread_short_strike}</span>
                    {' '}x{openPosition.spread_contracts}
                  </div>
                  <div>
                    Tail Put <span className="num">${openPosition.tail_put_strike}</span> x{openPosition.tail_put_contracts}
                  </div>
                  <div>
                    Entry Debit{' '}
                    <span className="num">
                      {formatCurrency((openPosition.spread_entry_debit || 0) + (openPosition.tail_put_entry_debit || 0))}
                    </span>
                  </div>
                  <div>Days Held: {openPosition.days_held}</div>
                </div>

                {openPosition.roll_due ? (
                  <div className={styles.rollDueBanner}>
                    Hedge roll due - {openPosition.days_held} days held. Recalculate below, then close this cycle.
                  </div>
                ) : (
                  <div className={styles.daysUntilRoll}>{openPosition.days_until_roll} days until roll due</div>
                )}

                <button className={styles.actionButton} onClick={() => setShowCloseForm((v) => !v)}>
                  {showCloseForm ? 'Cancel' : 'Close / Roll This Hedge'}
                </button>

                {showCloseForm && (
                  <form onSubmit={handleCloseHedge} className={styles.closeForm}>
                    <label>
                      Spread Close Credit
                      <input
                        type="number" step="0.01"
                        value={closeForm.spread_close_credit}
                        onChange={(e) => setCloseForm((f) => ({ ...f, spread_close_credit: e.target.value }))}
                        className={styles.settingsInput}
                      />
                    </label>
                    <label>
                      Tail Put Close Credit
                      <input
                        type="number" step="0.01"
                        value={closeForm.tail_put_close_credit}
                        onChange={(e) => setCloseForm((f) => ({ ...f, tail_put_close_credit: e.target.value }))}
                        className={styles.settingsInput}
                      />
                    </label>
                    <button type="submit" className={styles.saveButton} disabled={closing}>
                      {closing ? 'Closing…' : 'Confirm Close'}
                    </button>
                    {closeError && <div className={styles.error}>{closeError}</div>}
                  </form>
                )}
              </>
            ) : (
              <p className={styles.note}>No hedge currently open.</p>
            )}
          </div>

          <div className={styles.recalcSection}>
            <button className={styles.recalcButton} onClick={handleRecalculate} disabled={recalcLoading}>
              {recalcLoading ? 'Recalculating…' : 'Recalculate Hedge'}
            </button>
            {recalcError && <ErrorView message={recalcError} />}

            {recalc && (
              <div className={styles.recalcResult}>
                <div className={styles.positionGrid}>
                  <div>Spot <span className="num">${recalc.pricing.spot_price?.toFixed(2)}</span></div>
                  <div>Expiration {recalc.pricing.expiration} ({recalc.pricing.dte} DTE)</div>
                  <div>
                    Spread{' '}
                    <span className="num">${recalc.pricing.layer1_long?.strike}/{recalc.pricing.layer1_short?.strike}</span>
                    {' '}x{recalc.sizing.spreads_needed_mid}
                    {' '}(range {recalc.sizing.spreads_needed_low}-{recalc.sizing.spreads_needed_high})
                  </div>
                  <div>Tail Put <span className="num">${recalc.pricing.layer2_tail?.strike}</span> x{recalc.sizing.tail_contracts_needed}</div>
                  <div>Est. Total Debit <span className="num">{formatCurrency(recalc.sizing.estimated_total_debit)}</span></div>
                </div>

                {recalc.order_text?.length > 0 && (
                  <ul className={styles.orderText}>
                    {recalc.order_text.map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                )}

                {openPosition ? (
                  <p className={styles.note}>Close the current hedge above before opening a new one.</p>
                ) : (
                  <form onSubmit={handleOpenHedge} className={styles.closeForm}>
                    <label>
                      Actual Spread Debit
                      <input
                        type="number" step="0.01"
                        value={openForm?.spread_entry_debit || ''}
                        onChange={(e) => setOpenForm((f) => ({ ...f, spread_entry_debit: e.target.value }))}
                        className={styles.settingsInput}
                      />
                    </label>
                    <label>
                      Actual Tail Put Debit
                      <input
                        type="number" step="0.01"
                        value={openForm?.tail_put_entry_debit || ''}
                        onChange={(e) => setOpenForm((f) => ({ ...f, tail_put_entry_debit: e.target.value }))}
                        className={styles.settingsInput}
                      />
                    </label>
                    <button type="submit" className={styles.saveButton} disabled={opening}>
                      {opening ? 'Opening…' : 'Open This Hedge'}
                    </button>
                    {openError && <div className={styles.error}>{openError}</div>}
                  </form>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.playbookSection}>
        <h3 className={styles.sectionTitle}>Crash Playbook</h3>
        <MarkdownText>{CRASH_PLAYBOOK}</MarkdownText>
      </div>
    </section>
  );
}
