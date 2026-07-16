import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './NavDropdown.module.css';

/**
 * Grouped nav menu - click to open, click outside or navigate to close.
 * Same interaction pattern as ColumnPicker (this app's only existing
 * dropdown), reused here rather than inventing a second one.
 */
export default function NavDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const isActive = items.some((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  );

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={isActive ? `${styles.trigger} ${styles.active}` : styles.trigger}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span className={styles.arrow}>▾</span>
      </button>
      {open && (
        <div className={styles.menu}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive: linkActive }) =>
                linkActive ? `${styles.menuItem} ${styles.menuItemActive}` : styles.menuItem
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
