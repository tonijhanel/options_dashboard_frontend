/**
 * api/client.js
 * ----------------
 * All requests go to same-origin /api/* routes (Vercel serverless
 * functions - see /api at the project root), which hold the real
 * SNAPSHOT_API_KEY server-side and forward to the actual Railway
 * backend. The browser never sees the real key at all.
 */

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Most likely cause: running plain `npm run dev` instead of `vercel dev` -
    // Vite's dev server doesn't know about the /api serverless functions and
    // falls back to serving index.html (as HTML, with a 200 status) for any
    // unmatched path. That used to fail silently here; now it's a clear error.
    throw new Error(
      `Expected JSON from /api${path} but got "${contentType || 'unknown content-type'}". ` +
      `If you're running "npm run dev", the /api routes won't work - use "vercel dev" instead.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Failed to parse response from /api${path} as JSON.`);
  }

  if (!response.ok) {
    const message = (data && data.error) || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export function getPositions() {
  return request('/positions');
}

export function getTspPortfolio() {
  return request('/tsp-portfolio');
}

export function getCspScan(ticker, { minDelta, maxDelta, minDte, maxDte, includeIlliquid } = {}) {
  const params = new URLSearchParams();
  if (minDelta !== undefined) params.set('min_delta', minDelta);
  if (maxDelta !== undefined) params.set('max_delta', maxDelta);
  if (minDte !== undefined) params.set('min_dte', minDte);
  if (maxDte !== undefined) params.set('max_dte', maxDte);
  if (includeIlliquid) params.set('include_illiquid', 'true');
  const qs = params.toString();
  return request(`/csp-scan/${encodeURIComponent(ticker)}${qs ? `?${qs}` : ''}`);
}

/** Free - just reads whatever the backend's scheduled job (or a previous
 * hard refresh) last stored. No Alpha Vantage cost. */
export function getNewsSentiment() {
  return request('/news-sentiment');
}

/** Costs real Alpha Vantage quota (25/day free tier) - triggers a brand
 * new fetch+analysis cycle rather than reading what's already stored.
 * Keep this behind a clearly-separate, deliberate action in the UI. */
export function hardRefreshNewsSentiment() {
  return request('/news-sentiment/refresh', { method: 'POST' });
}

/** status: 'open' (default), 'closed', or 'all' */
export function getPositionLog(status = 'open') {
  return request(`/position-log?status=${status}`);
}

export function getRealizedPnl() {
  return request('/realized-pnl');
}

export function getPnlRange(start, end) {
  return request(`/pnl-range?start=${start}&end=${end}`);
}

export function getSchwabTokenHealth() {
  return request('/schwab-token-health');
}

export function getTickers() {
  return request('/tickers');
}

export function addTicker(payload) {
  return request('/tickers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteTicker(ticker) {
  return request(`/tickers/${ticker}`, { method: 'DELETE' });
}

export function classifyTicker(ticker) {
  return request('/tickers/classify', {
    method: 'POST',
    body: JSON.stringify({ ticker }),
  });
}

export function getSchwabReconnectUrl() {
  return request('/schwab-reconnect-url');
}

export function submitSchwabReconnect(redirectUrl) {
  return request('/schwab-reconnect', {
    method: 'POST',
    body: JSON.stringify({ redirect_url: redirectUrl }),
  });
}

export function createPositionLogEntry(payload) {
  return request('/position-log', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePositionLogEntry(id, payload) {
  return request(`/position-log/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}