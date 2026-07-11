import { proxyToRailway } from './_lib/proxy.js';

/**
 * api/catchall.js
 * -------------------
 * Single catch-all proxy for every /api/* route, dispatched via an
 * EXPLICIT rewrite in vercel.json:
 *   { "source": "/api/:path*", "destination": "/api/catchall?path=:path*" }
 *
 * Switched away from the implicit [...path].js bracket-filename
 * convention after it produced a real, confirmed bug for multi-segment
 * paths in production (a single-segment route like /api/positions
 * worked fine, but a two-segment route like /api/csp-scan/FXI hit
 * Vercel's own generic 404 - the request never even reached this
 * function). Rather than keep guessing at that convention's exact
 * multi-segment behavior in a plain-Vite (non-Next.js) project, this
 * uses Vercel's explicit, documented named-parameter rewrite syntax
 * instead, which behaves predictably regardless of how many path
 * segments are involved.
 *
 * Under this mechanism, the `path` query param arrives as a single
 * STRING with segments already joined by "/" (e.g. "csp-scan/FXI"), NOT
 * an array the way the old bracket convention populated it - that's the
 * one thing to remember if this file is ever touched again.
 */
export default function handler(req, res) {
  const pathString = req.query.path || '';
  const backendPath = '/' + String(pathString).replace(/^\/+/, '');

  // Everything else in req.query (i.e. NOT the "path" key) is a real
  // query param the browser sent - e.g. min_delta, start/end dates, etc.
  const { path: _unused, ...realQueryParams } = req.query;

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