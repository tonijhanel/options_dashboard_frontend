import { useState, useEffect, useCallback } from 'react';
import { getCached, setCached } from './cache';

/**
 * Generic data-fetching hook with a session-level cache. Without this,
 * React fully remounts a page component every time you navigate away and
 * back (normal React Router behavior) - which meant re-running the whole
 * slow fetch (several sequential Schwab/Tradier/SnapTrade calls under the
 * hood for /positions) every single time, even seconds after the last
 * visit. Now: if this cacheKey has already been loaded this session, show
 * it instantly on mount instead of showing a loading spinner again.
 * Call refetch() (e.g. a "Refresh" button) to explicitly get fresh data.
 */
export function useApiData(fetcher, cacheKey, deps = []) {
  const cached = getCached(cacheKey);
  const [data, setData] = useState(cached !== undefined ? cached : null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(cached === undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
      setCached(cacheKey, result);
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    // Only fetch on mount if we don't already have cached data - this is
    // the whole fix. refetch() (returned below) always fetches for real.
    if (getCached(cacheKey) === undefined) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { data, error, loading, refetch: load };
}
