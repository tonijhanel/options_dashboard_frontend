import { proxyToRailway } from './_lib/proxy.js';

/**
 * api/[...path].js
 * -------------------
 * Single catch-all proxy replacing what used to be a dozen near-identical
 * files (api/positions.js, api/tsp-portfolio.js, api/csp-scan/[ticker].js,
 * etc.) - each one was just proxyToRailway() with a different hardcoded
 * path. Vercel's Hobby plan caps a deployment at 12 Serverless Functions
 * total, and that dozen individual files hit the ceiling the moment the
 * three Schwab-reconnect routes were added.
 *
 * Vercel's catch-all dynamic route convention: a file named [...path].js
 * matches ANY request path under /api/ with one or more segments, making
 * the matched segments available as an array on req.query.path. E.g. a
 * request to /api/csp-scan/ARKK gives req.query.path = ['csp-scan', 'ARKK'].
 * Joining those segments back together and forwarding to Railway at the
 * same path reproduces every one of the old individual files' behavior
 * exactly, including the dynamic-ticker/dynamic-id ones - and means no new
 * file is ever needed again when a new backend route gets added.
 *
 * proxyToRailway() already forwards the query string directly from
 * req.url (not from req.query), so ?start=...&end=... etc. on pnl-range
 * and similar routes keep working unchanged.
 */
export default function handler(req, res) {
  // For a plain Vite project (no Next.js routing layer on top), Vercel's
  // raw Build Output API appears to populate the catch-all segments
  // under the literal bracket-syntax key ("...path", dots included) -
  // NOT the clean "path" key Next.js's own routing normalizes to. Check
  // both explicitly rather than gambling on one, since this produced a
  // genuinely broken URL in production before this fix (the real
  // segments fell through into "everything else" and got appended to
  // the query string literally, while the empty fallback path collapsed
  // to a bare "/").
  const pathValue = req.query.path !== undefined ? req.query.path : req.query['...path'];
  const { path: _unusedPath, '...path': _unusedDotsPath, ...realQueryParams } = req.query;

  const segments = Array.isArray(pathValue) ? pathValue : [pathValue];
  const backendPath = '/' + segments.filter(Boolean).join('/');

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(realQueryParams)) {
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, v));
    } else {
      searchParams.append(key, value);
    }
  }
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';

  return proxyToRailway(req, res, backendPath, queryString);
}