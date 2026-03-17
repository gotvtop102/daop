import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Ads from './pages/Ads';
import Banners from './pages/Banners';
import HomepageSections from './pages/HomepageSections';
import SiteSettings from './pages/SiteSettings';
import DonateSettings from './pages/DonateSettings';
import StaticPages from './pages/StaticPages';
import PrerollAds from './pages/PrerollAds';
import Slider from './pages/Slider';
import MenuBackground from './pages/MenuBackground';
import FilterOrder from './pages/FilterOrder';
import CategoryPageSettings from './pages/CategoryPageSettings';
import ThemeSettings from './pages/ThemeSettings';
import PlayerSettings from './pages/PlayerSettings';
import AuditLogs from './pages/AuditLogs';
import GitHubActions from './pages/GitHubActions';
import GoogleSheetsPage from './pages/GoogleSheets';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AuthGuard><Layout /></AuthGuard>}>
          <Route index element={<Dashboard />} />
          <Route path="ads" element={<Ads />} />
          <Route path="banners" element={<Banners />} />
          <Route path="slider" element={<Slider />} />
          <Route path="menu-background" element={<MenuBackground />} />
          <Route path="filter-order" element={<FilterOrder />} />
          <Route path="homepage-sections" element={<HomepageSections />} />
          <Route path="category-page-settings" element={<CategoryPageSettings />} />
          <Route path="settings" element={<SiteSettings />} />
          <Route path="theme" element={<ThemeSettings />} />
          <Route path="player-settings" element={<PlayerSettings />} />
          <Route path="google-sheets" element={<GoogleSheetsPage />} />
          <Route path="donate" element={<DonateSettings />} />
          <Route path="static-pages" element={<StaticPages />} />
          <Route path="preroll" element={<PrerollAds />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="github-actions" element={<GitHubActions />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
