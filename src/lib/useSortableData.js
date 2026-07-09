import { useState, useMemo } from 'react';

/**
 * Generic click-to-sort hook. `getSortValue(row, columnKey)` extracts a
 * comparable primitive for a given column - needed because some columns
 * (status, recommendation) hold objects, not plain numbers/strings.
 */
export function useSortableData(data, getSortValue) {
  const [sortKey, setSortKey] = useState(null);
  const [direction, setDirection] = useState('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const withValues = data.map((row) => ({ row, value: getSortValue(row, sortKey) }));

    // Nulls/undefined always sort to the bottom, regardless of direction -
    // they represent missing data, not a value that should ever end up
    // prioritized to the top just because the direction flipped.
    const withValue = withValues.filter((w) => w.value !== null && w.value !== undefined);
    const withoutValue = withValues.filter((w) => w.value === null || w.value === undefined);

    withValue.sort((a, b) => {
      const cmp = typeof a.value === 'string' ? a.value.localeCompare(b.value) : a.value - b.value;
      return direction === 'asc' ? cmp : -cmp;
    });

    return [...withValue, ...withoutValue].map((w) => w.row);
  }, [data, sortKey, direction, getSortValue]);

  function requestSort(columnKey) {
    if (sortKey === columnKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(columnKey);
      setDirection('asc');
    }
  }

  return { sorted, sortKey, direction, requestSort };
}