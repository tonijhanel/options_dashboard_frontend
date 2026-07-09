import { useMemo } from 'react';
import { getNewsSentiment } from '../api/client';
import { useApiData } from './useApiData';

/**
 * Wraps the shared session-cached /news-sentiment fetch (via useApiData,
 * cacheKey 'news-sentiment') with a lookup helper. Every component that
 * calls this - the dedicated News & Sentiment page, and every
 * NewsPreview instance on Positions/Portfolio Overview - shares the SAME
 * cached fetch, so hovering over ten tickers doesn't trigger ten
 * separate API calls.
 */
export function useNewsSentiment() {
  const { data, error, loading, refetch } = useApiData(getNewsSentiment, 'news-sentiment');

  const byKey = useMemo(() => {
    const map = new Map();
    for (const row of data?.results || []) {
      map.set(`${row.scope}:${row.scope_key}`, row);
    }
    return map;
  }, [data]);

  function getEntry(scope, scopeKey) {
    return byKey.get(`${scope}:${scopeKey}`) || null;
  }

  return { data, error, loading, refetch, getEntry };
}