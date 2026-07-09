import { useState, useEffect, useRef } from 'react';
import styles from './ColumnPicker.module.css';

export function useColumnVisibility(allColumns, storageKey) {
  const fullKey = `columnVisibility.${storageKey}`;
  const [hidden, setHidden] = useState(() => {
    try {
      const saved = localStorage.getItem(fullKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify([...hidden]));
    } catch {
      // Storage unavailable (private browsing, etc.) - just don't persist,
      // the picker still works for the current session.
    }
  }, [hidden, fullKey]);

  function toggle(key) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visibleColumns = allColumns.filter((c) => c.alwaysVisible || !hidden.has(c.key));
  return { hidden, toggle, visibleColumns };
}

export default function ColumnPicker({ columns, hidden, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        Columns
      </button>
      {open && (
        <div className={styles.menu}>
          {columns.map((col) => (
            <label key={col.key} className={styles.item}>
              <input
                type="checkbox"
                checked={col.alwaysVisible || !hidden.has(col.key)}
                disabled={col.alwaysVisible}
                onChange={() => onToggle(col.key)}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}