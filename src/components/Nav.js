import { NavLink } from 'react-router-dom';
import styles from './Nav.module.css';
import NavDropdown from './NavDropdown';
import SchwabTokenStatus from './SchwabTokenStatus';
import AnomalyStatusBadge from './AnomalyStatusBadge';
import LiquidityStatusBadge from './LiquidityStatusBadge';
import SnapTradeConnectionStatus from './SnapTradeConnectionStatus';
import LogoutButton from './LogoutButton';

// Per docs/navupdates.md: top-level items grouped by actual usage
// frequency/intent, not build history. Positions and Bulk Scan stay
// standalone (checked often enough to deserve zero-click access); Active
// Spreads is now its own dropdown (2026-07-24) splitting vertical spreads
// from BWBs, since they're tracked on two separate pages; everything else
// groups into one of the other two dropdowns.
const POSITION_MANAGEMENT_ITEMS = [
  { to: '/portfolio-overview', label: 'Portfolio Overview' },
  { to: '/position-log', label: 'Position Log' },
  { to: '/pnl-history', label: 'P&L History' },
  { to: '/hedge', label: 'Hedge' },
  { to: '/raw-positions', label: 'All Positions' },
];

const POSITION_SCANNER_ITEMS = [
  { to: '/csp-scan', label: 'Single Position Scan' },
  { to: '/trade-signals', label: 'Trade Signals' },
  { to: '/ticker-registry', label: 'Ticker Registry' },
];

const ACTIVE_SPREADS_ITEMS = [
  { to: '/active-spreads', label: 'Vertical Spreads' },
  { to: '/bwb-trades', label: 'BWB Spreads' },
  { to: '/calendar-spreads', label: 'Calendar Spreads' },
];

// Standalone, chain-free pre-trade calculators (evaluate-only, no
// persistence) - a distinct category from the live scanners/trackers
// above, likely to grow (docs/bwb_eval.md, docs/credit_eval.md).
const TOOLS_ITEMS = [
  { to: '/bwb-eval', label: 'Evaluate BWB Trades' },
  { to: '/credit-eval', label: 'Evaluate Credit Spreads' },
];

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>Options Dashboard</div>
      <div className={styles.links}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          CSP Positions
        </NavLink>
        <NavLink to="/tsp-scan" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Bulk Scan
        </NavLink>
        <NavLink to="/covered-calls" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
          Covered Calls
        </NavLink>
        <NavDropdown label="Active Spreads" items={ACTIVE_SPREADS_ITEMS} />
        <NavDropdown label="Position Management" items={POSITION_MANAGEMENT_ITEMS} />
        <NavDropdown label="Position Scanner" items={POSITION_SCANNER_ITEMS} />
        <NavDropdown label="Tools" items={TOOLS_ITEMS} />
        <NavLink
          to="/news-sentiment"
          className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
        >
          News & Sentiment
        </NavLink>
      </div>
      <LogoutButton />
      <AnomalyStatusBadge />
      <LiquidityStatusBadge />
      <SnapTradeConnectionStatus />
      <SchwabTokenStatus />
    </nav>
  );
}
