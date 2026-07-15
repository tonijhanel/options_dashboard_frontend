import { formatDate } from '../lib/formatDate';
import styles from './MarketCalendarWidget.module.css';

const TYPE_LABELS = {
  holiday: 'Holiday',
  early_close: 'Early Close',
  fomc: 'FOMC',
  macro: 'Macro',
};

function buildEvents(calendar) {
  const events = [
    ...(calendar.holidays || []).map((h) => ({ date: h.date, label: h.label, type: 'holiday' })),
    ...(calendar.early_closes || []).map((e) => ({ date: e.date, label: 'Early close (1:00pm ET)', type: 'early_close' })),
    ...(calendar.fomc_dates || []).map((d) => ({ date: d, label: 'FOMC Rate Decision', type: 'fomc' })),
    ...(calendar.macro_events || []).map((m) => ({ date: m.date, label: m.label, type: 'macro' })),
  ];
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export default function MarketCalendarWidget({ calendar }) {
  if (!calendar) return null;
  const events = buildEvents(calendar);

  return (
    <div>
      {!calendar.is_trading_day_today && (
        <div className={styles.todayBanner}>Market closed today</div>
      )}
      {calendar.is_trading_day_today && calendar.is_early_close_today && (
        <div className={styles.todayBanner}>Early close today (1:00pm ET)</div>
      )}

      {events.length === 0 ? (
        <p className={styles.empty}>Nothing on the calendar in this window.</p>
      ) : (
        <ul className={styles.list}>
          {events.map((e, i) => (
            <li key={`${e.date}-${e.type}-${i}`} className={styles.item}>
              <span className={`${styles.typeTag} ${styles[e.type]}`}>{TYPE_LABELS[e.type]}</span>
              <span className={styles.date}>{formatDate(e.date)}</span>
              <span className={styles.label}>{e.label}</span>
            </li>
          ))}
        </ul>
      )}

      {calendar.errors && calendar.errors.length > 0 && (
        <p className={styles.errorNote}>Some data may be incomplete: {calendar.errors.join('; ')}</p>
      )}
    </div>
  );
}
