function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export function getPresetRange(preset) {
  const now = new Date();
  const today = toDateStr(now);

  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'this_week': {
      const day = now.getDay(); // 0 = Sunday
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      return { start: toDateStr(monday), end: today };
    }
    case 'this_month': {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toDateStr(firstOfMonth), end: today };
    }
    case 'last_30_days': {
      const thirtyAgo = new Date(now);
      thirtyAgo.setDate(now.getDate() - 30);
      return { start: toDateStr(thirtyAgo), end: today };
    }
    case 'ytd': {
      const jan1 = new Date(now.getFullYear(), 0, 1);
      return { start: toDateStr(jan1), end: today };
    }
    case 'all_time':
      return { start: '2020-01-01', end: today };
    default:
      return { start: today, end: today };
  }
}

export const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'ytd', label: 'Year to Date' },
  { key: 'all_time', label: 'All Time' },
];