/**
 * lib/cache.js
 * --------------
 * A simple module-level cache, shared across every component that
 * imports it. Since ES modules are singletons, this Map persists for the
 * life of the browser tab/session (until a full page reload) - exactly
 * long enough to stop re-fetching every time you navigate back to a page
 * you've already visited, without needing any real persistence layer.
 */
const cache = new Map();

export function getCached(key) {
  return cache.has(key) ? cache.get(key) : undefined;
}

export function setCached(key, value) {
  cache.set(key, value);
}
