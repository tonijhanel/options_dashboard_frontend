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

export async function proxyToRailway(req, res, backendPath) {
  const rawBaseUrl = process.env.RAILWAY_API_URL;
  const apiKey = process.env.RAILWAY_API_KEY;

  if (!rawBaseUrl || !apiKey) {
    res.status(500).json({ error: 'RAILWAY_API_URL/RAILWAY_API_KEY not configured on the proxy' });
    return;
  }

  // Normalize slashes so a trailing slash on RAILWAY_API_URL (or any
  // future variation in how backendPath gets built) can never produce a
  // malformed double-slash URL - Railway's own infra layer was serving an
  // HTML error page for exactly this, before Flask ever saw the request.
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const normalizedPath = '/' + backendPath.replace(/^\/+/, '');

  // Forward any query string the browser sent (e.g. ?min_delta=0.10)
  const queryIndex = req.url.indexOf('?');
  const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : '';

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