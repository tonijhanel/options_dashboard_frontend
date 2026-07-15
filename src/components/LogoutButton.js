import { useState } from 'react';
import styles from './LogoutButton.module.css';

export default function LogoutButton() {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth-logout', { method: 'POST' });
    } finally {
      window.location.href = '/login.html';
    }
  }

  return (
    <button className={styles.logoutButton} onClick={handleLogout} disabled={loggingOut}>
      {loggingOut ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}