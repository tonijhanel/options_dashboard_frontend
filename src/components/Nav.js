import { NavLink } from 'react-router-dom';
import styles from './Nav.module.css';
import SchwabTokenStatus from './SchwabTokenStatus';
import LogoutButton from './LogoutButton';

const LINKS = [
  { to: '/', label: 'Positions' },
  { to: '/portfolio-overview', label: 'Portfolio Overview' },
  { to: '/news-sentiment', label: 'News & Sentiment' },
  { to: '/position-log', label: 'Position Log' },
  { to: '/tsp-scan', label: 'Bulk Scan' },
  { to: '/csp-scan', label: 'Single Position Scan' },
  { to: '/pnl-history', label: 'P&L History' },
  { to: '/ticker-registry', label: 'Ticker Registry' },
];

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>Options Dashboard</div>
      <div className={styles.links}>
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            {link.label}
          </NavLink>
          
        ))}
      </div>
      <LogoutButton />
      <SchwabTokenStatus />
    </nav>
  );
}