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
  const baseUrl = process.env.RAILWAY_API_URL;
  const apiKey = process.env.RAILWAY_API_KEY;

  if (!baseUrl || !apiKey) {
    res.status(500).json({ error: 'RAILWAY_API_URL/RAILWAY_API_KEY not configured on the proxy' });
    return;
  }

  // Forward any query string the browser sent (e.g. ?min_delta=0.10)
  const queryIndex = req.url.indexOf('?');
  const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : '';

  const url = `${baseUrl}${backendPath}${queryString}`;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `Failed to reach backend: ${e.message}` });
  }
}
