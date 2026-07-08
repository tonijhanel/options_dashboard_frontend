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
