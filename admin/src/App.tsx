import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';
import AccessRouteGuard from './components/AccessRouteGuard';
import { AccessProvider } from './context/AccessContext';
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
import SupabaseTools from './pages/SupabaseTools';
import MovieList from './pages/MovieList';
import MovieEdit from './pages/MovieEdit';
import EpisodeEdit from './pages/EpisodeEdit';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AuthGuard><AccessProvider><Layout /></AccessProvider></AuthGuard>}>
          <Route index element={<Dashboard />} />
          <Route path="ads" element={<AccessRouteGuard><Ads /></AccessRouteGuard>} />
          <Route path="banners" element={<AccessRouteGuard><Banners /></AccessRouteGuard>} />
          <Route path="slider" element={<Slider />} />
          <Route path="menu-background" element={<MenuBackground />} />
          <Route path="filter-order" element={<FilterOrder />} />
          <Route path="homepage-sections" element={<HomepageSections />} />
          <Route path="category-page-settings" element={<CategoryPageSettings />} />
          <Route path="settings" element={<SiteSettings />} />
          <Route path="theme" element={<ThemeSettings />} />
          <Route path="player-settings" element={<PlayerSettings />} />
          <Route path="donate" element={<DonateSettings />} />
          <Route path="static-pages" element={<StaticPages />} />
          <Route path="preroll" element={<AccessRouteGuard><PrerollAds /></AccessRouteGuard>} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="supabase-tools" element={<AccessRouteGuard><SupabaseTools /></AccessRouteGuard>} />
          <Route path="github-actions" element={<GitHubActions />} />
          <Route path="movies/:category" element={<AccessRouteGuard><MovieList /></AccessRouteGuard>} />
          <Route path="movies/edit/:id" element={<AccessRouteGuard><MovieEdit /></AccessRouteGuard>} />
          <Route path="movies/episodes/:id" element={<AccessRouteGuard><EpisodeEdit /></AccessRouteGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
