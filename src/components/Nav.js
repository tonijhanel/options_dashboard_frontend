import { NavLink } from 'react-router-dom';
import styles from './Nav.module.css';
import NavDropdown from './NavDropdown';
import SchwabTokenStatus from './SchwabTokenStatus';
import LogoutButton from './LogoutButton';

// Per docs/navinstructions.md: 5 top-level items grouped by actual usage
// frequency/intent, not build history. Positions and Bulk Scan stay
// standalone (most-used day to day); everything else groups into one of
// two dropdowns.
const POSITION_MANAGEMENT_ITEMS = [
  { to: '/portfolio-overview', label: 'Portfolio Overview' },
  { to: '/position-log', label: 'Position Log' },
  { to: '/pnl-history', label: 'P&L History' },
  { to: '/hedge', label: 'Hedge' },
];

const POSITION_SCANNER_ITEMS = [
  { to: '/csp-scan', label: 'Single Position Scan' },
  { to: '/ticker-registry', label: 'Ticker Registry' },
];

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>Options Dashboard</div>
      <div className={styles.links}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Positions
        </NavLink>
        <NavLink to="/tsp-scan" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Bulk Scan
        </NavLink>
        <NavDropdown label="Position Management" items={POSITION_MANAGEMENT_ITEMS} />
        <NavDropdown label="Position Scanner" items={POSITION_SCANNER_ITEMS} />
        <NavLink
          to="/news-sentiment"
          className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
        >
          News & Sentiment
        </NavLink>
      </div>
      <LogoutButton />
      <SchwabTokenStatus />
    </nav>
  );
}
