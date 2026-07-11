import { useState, useEffect, useRef, useCallback } from 'react';
import { getSchwabTokenHealth, getSchwabReconnectUrl, submitSchwabReconnect } from '../api/client';
import styles from './SchwabTokenStatus.module.css';

const STATUS_COPY = {
  healthy: { label: (d) => `Schwab: ${d.toFixed(1)}d left`, tone: 'positive' },
  warning: { label: (d) => `Schwab: ${d.toFixed(1)}d left - reconnect soon`, tone: 'warning' },
  critical: { label: (d) => `Schwab: ${d.toFixed(1)}d left - reconnect now`, tone: 'negative' },
  expired: { label: () => 'Schwab: expired - reconnect required', tone: 'negative' },
  unknown: { label: () => 'Schwab: status unknown', tone: 'neutral' },
  error: { label: () => 'Schwab: status unavailable', tone: 'neutral' },
};

export default function SchwabTokenStatus() {
  const [health, setHealth] = useState(null);
  const [open, setOpen] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [pastedUrl, setPastedUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [redirectBanner, setRedirectBanner] = useState(null); // 'success' | 'error' | null
  const ref = useRef(null);

  const loadHealth = useCallback(async () => {
    try {
      const result = await getSchwabTokenHealth();
      setHealth(result);
    } catch {
      setHealth({ status: 'error', days_remaining: null });
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  // Detect the automatic-callback redirect (?schwab_reconnect=success|error)
  // on load, show a banner, refresh the health check, and clean the URL
  // so it doesn't linger or reappear on a later manual refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('schwab_reconnect');
    if (result === 'success') {
      setRedirectBanner({ type: 'success', message: 'Reconnected - the 7-day clock has restarted.' });
      loadHealth();
    } else if (result === 'error') {
      setRedirectBanner({ type: 'error', message: params.get('message') || 'Reconnect failed.' });
    }
    if (result) {
      params.delete('schwab_reconnect');
      params.delete('message');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
      window.history.replaceState({}, '', newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleOpenReconnect() {
    setSubmitError(null);
    try {
      const result = await getSchwabReconnectUrl();
      window.open(result.url, '_blank');
    } catch (e) {
      setSubmitError(e.message);
    }
  }

  async function handleSubmitManualCode() {
    if (!pastedUrl.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitSchwabReconnect(pastedUrl.trim());
      setRedirectBanner({ type: 'success', message: 'Reconnected - the 7-day clock has restarted.' });
      setPastedUrl('');
      setShowManualFallback(false);
      await loadHealth();
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!health) return null;

  const copy = STATUS_COPY[health.status] || STATUS_COPY.unknown;

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={`${styles.trigger} ${styles[copy.tone]}`} onClick={() => setOpen((o) => !o)}>
        <span className={styles.dot} />
        {copy.label(health.days_remaining)}
      </button>

      {redirectBanner && !open && (
        <div className={`${styles.floatingBanner} ${redirectBanner.type === 'success' ? styles.success : styles.error}`}>
          {redirectBanner.message}
        </div>
      )}

      {open && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Schwab Connection</h3>

          <p className={styles.panelText}>
            The refresh token Schwab issues is hard-capped at 7 days by their own security design -
            there's no way to extend it automatically. When it's close to expiring, reconnect below.
          </p>

          {redirectBanner && (
            <div className={redirectBanner.type === 'success' ? styles.success : styles.error}>
              {redirectBanner.message}
            </div>
          )}

          <button className={styles.reconnectButton} onClick={handleOpenReconnect}>
            Reconnect Schwab
          </button>
          <p className={styles.panelHint}>
            Opens Schwab's login in a new tab. Log in and authorize - you'll be redirected straight
            back here, already reconnected. No copy-pasting needed.
          </p>

          {!showManualFallback ? (
            <button className={styles.linkButton} onClick={() => setShowManualFallback(true)}>
              Redirect didn't work? Paste the URL manually
            </button>
          ) : (
            <div className={styles.manualFallback}>
              <label className={styles.stepLabel}>
                Paste the full redirected URL from your browser's address bar:
              </label>
              <input
                type="text"
                value={pastedUrl}
                onChange={(e) => setPastedUrl(e.target.value)}
                placeholder="https://.../schwab-oauth-callback?code=..."
                className={styles.urlInput}
              />
              <button
                className={styles.reconnectButton}
                onClick={handleSubmitManualCode}
                disabled={submitting || !pastedUrl.trim()}
              >
                {submitting ? 'Connecting…' : 'Submit'}
              </button>
            </div>
          )}

          {submitError && <div className={styles.error}>{submitError}</div>}
        </div>
      )}
    </div>
  );
}