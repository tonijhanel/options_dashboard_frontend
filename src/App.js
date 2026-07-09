import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import PositionsPage from './pages/PositionsPage';
import TspScanPage from './pages/TspScanPage';
import CspScanPage from './pages/CspScanPage';
import PortfolioOverviewPage from './pages/PortfolioOverviewPage';
import styles from './App.module.css';

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<PositionsPage />} />
          <Route path="/tsp-scan" element={<TspScanPage />} />
          <Route path="/csp-scan" element={<CspScanPage />} />
          <Route path="/portfolio-overview" element={<PortfolioOverviewPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}