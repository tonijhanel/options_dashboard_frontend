/**
 * api/_lib/proxy.js
 * --------------------
 * Shared helper for every /api/* serverless function. Forwards the
 * request to the real Railway backend, adding the X-API-Key header
 * server-side (from Vercel's environment variables, never exposed to
 * the browser). Underscore-prefixed folder so Vercel doesn't treat this
 * as a route itself - it's a plain importable module.
 *
 * Required Vercel environment variables (set in the Vercel dashboard,
 * not in any file committed to the repo):
 *   RAILWAY_API_URL - e.g. https://web-production-060e0.up.railway.app
 *   RAILWAY_API_KEY - the same value as SNAPSHOT_API_KEY on Railway
 */

export async function proxyToRailway(req, res, backendPath, explicitQueryString) {
  const rawBaseUrl = process.env.RAILWAY_API_URL;
  const apiKey = process.env.RAILWAY_API_KEY;

  if (!rawBaseUrl || !apiKey) {
    res.status(500).json({ error: 'RAILWAY_API_URL/RAILWAY_API_KEY not configured on the proxy' });
    return;
  }

  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const normalizedPath = '/' + backendPath.replace(/^\/+/, '');

  // For a dynamic catch-all route ([...path].js), req.url reflects
  // Vercel's own internal routing bookkeeping for the matched segments,
  // not the original clean request - relying on it here produced a
  // malformed URL (a literal "?...path=positions" ended up appended to
  // the backend URL). The caller should build a clean query string from
  // req.query directly (excluding whatever key holds the path segments)
  // and pass it explicitly. Falls back to parsing req.url for any other
  // caller that doesn't need this (kept for backward compatibility).
  const queryString = explicitQueryString !== undefined
    ? explicitQueryString
    : (() => {
        const queryIndex = req.url.indexOf('?');
        return queryIndex !== -1 ? req.url.slice(queryIndex) : '';
      })();

  const url = `${baseUrl}${normalizedPath}${queryString}`;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      // The backend (or something in front of it) returned something
      // that isn't JSON - report the actual status and a snippet of what
      // came back instead of just the generic parse-error message, so
      // this is diagnosable from the browser directly next time.
      res.status(502).json({
        error: `Backend returned non-JSON response (status ${response.status}) for ${url}: ${rawText.slice(0, 200)}`,
      });
      return;
    }

    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `Failed to reach backend at ${url}: ${e.message}` });
  }
}