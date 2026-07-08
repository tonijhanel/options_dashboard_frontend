# Options Dashboard Frontend

React + Vite frontend for the options trading dashboard, deployed on Vercel.
Talks to the Railway backend through a proxy layer (`/api/*`, Vercel
serverless functions) that holds the real API key server-side - the
browser never sees it.

## What's here

- **v1 pages**: Positions, TSP Scan, CSP Scan (matching the backend routes
  we've already built and tested).
- **Client-side status logic**: `src/lib/positionSignal.js` is a direct
  JS port of `services/position_signal.py` - this is intentional. The
  backend deliberately returns raw position facts only (no 🟩/🟪/🟦 tag),
  since the take-profit threshold is a personal preference, not a fact
  about the position. The slider on the Positions page is where that
  preference actually gets applied.
- **Design tokens**: `src/index.css` - dark charcoal background, antique
  gold accent (a nod to the gold-miner ETFs in the actual portfolio), IBM
  Plex Mono for all numeric data so decimals actually align. Status colors
  match `position_signal.py`'s emoji scheme exactly.

## Local development

```bash
npm install
npm run dev
```

This runs the Vite dev server, but **the `/api/*` proxy routes won't work
locally** unless you also run `vercel dev` (which emulates the serverless
functions) - see below.

To test the full stack locally, including the proxy:
```bash
npm install -g vercel
vercel dev
```
This needs the same environment variables as production (see below) set
in a local `.env` file that `vercel dev` will pick up:
```
RAILWAY_API_URL=https://your-railway-url.up.railway.app
RAILWAY_API_KEY=your_snapshot_api_key
```

## Deploying to Vercel

1. Push this project to its own GitHub repo (separate from the backend repo).
2. In Vercel: New Project → Import the repo → it should auto-detect Vite.
3. **Before your first deploy**, set the environment variables in Vercel's
   project settings (Settings → Environment Variables):
   ```
   RAILWAY_API_URL=https://your-railway-url.up.railway.app
   RAILWAY_API_KEY=your_snapshot_api_key
   ```
   These are read server-side only, inside `/api/_lib/proxy.js` - never
   sent to the browser.
4. Deploy. Vercel builds the Vite app AND deploys the `/api` folder as
   serverless functions automatically - no separate configuration needed
   for a project laid out this way.

## Adding a new backend route to the proxy

Each Vercel function under `/api` is a thin one-liner forwarding to a
specific backend path - see `api/positions.js` or `api/tsp-portfolio.js`
for the pattern. For a new route:

```js
import { proxyToRailway } from './_lib/proxy.js';

export default function handler(req, res) {
  return proxyToRailway(req, res, '/your-backend-path');
}
```

For a dynamic path segment (like `/csp-scan/<ticker>`), use Vercel's
file-based dynamic routing - see `api/csp-scan/[ticker].js`.

## Not yet built (future scope)

- Ticker Registry page (`/tickers` - list + add)
- News & Sentiment page (`/news-sentiment`)
- Market Calendar widget (`/market-news`)
- Position Log page (manual add/close, `/position-log`)

These all have working, tested backend endpoints already - just need
frontend pages built the same way as the three above.
