import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import PositionsPage from './pages/PositionsPage';
import TspScanPage from './pages/TspScanPage';
import CspScanPage from './pages/CspScanPage';
import PortfolioOverviewPage from './pages/PortfolioOverviewPage';
import NewsSentimentPage from './pages/NewsSentimentPage';
import PositionLogPage from './pages/PositionLogPage';
import PnlHistoryPage from './pages/PnlHistoryPage';
import TickerRegistryPage from './pages/TickerRegistryPage';
import HedgePage from './pages/HedgePage';
import ActiveSpreadsPage from './pages/ActiveSpreadsPage';
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
          <Route path="/news-sentiment" element={<NewsSentimentPage />} />
          <Route path="/position-log" element={<PositionLogPage />} />
          <Route path="/pnl-history" element={<PnlHistoryPage />} />
          <Route path="/ticker-registry" element={<TickerRegistryPage />} />
          <Route path="/hedge" element={<HedgePage />} />
          <Route path="/active-spreads" element={<ActiveSpreadsPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}