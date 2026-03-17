import { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Button, message, Drawer, Grid } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogoutOutlined, MenuOutlined, SafetyOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import {
  DashboardOutlined,
  PictureOutlined,
  PlaySquareOutlined,
  AppstoreOutlined,
  SettingOutlined,
  DollarOutlined,
  FileTextOutlined,
  AuditOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  VideoCameraOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content, Footer } = AntLayout;
const { useBreakpoint } = Grid;

const items = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
  {
    key: '/ads',
    icon: <PictureOutlined />,
    label: <Link to="/ads">Quảng cáo</Link>,
    children: [
      { key: '/banners', icon: <PictureOutlined />, label: <Link to="/banners">Banner</Link> },
      { key: '/preroll', icon: <PlaySquareOutlined />, label: <Link to="/preroll">Pre-roll</Link> },
    ],
  },
  {
    key: '/giao-dien',
    icon: <AppstoreOutlined />,
    label: 'Giao diện',
    children: [
      { key: '/slider', icon: <PictureOutlined />, label: <Link to="/slider">Slider</Link> },
      { key: '/menu-background', icon: <PictureOutlined />, label: <Link to="/menu-background">Nền menu</Link> },
      { key: '/filter-order', icon: <AppstoreOutlined />, label: <Link to="/filter-order">Sắp xếp bộ lọc</Link> },
      { key: '/homepage-sections', icon: <AppstoreOutlined />, label: <Link to="/homepage-sections">Sections</Link> },
      { key: '/category-page-settings', icon: <AppstoreOutlined />, label: <Link to="/category-page-settings">Trang danh mục</Link> },
      { key: '/theme', icon: <SettingOutlined />, label: <Link to="/theme">Theme</Link> },
      { key: '/static-pages', icon: <FileTextOutlined />, label: <Link to="/static-pages">Trang tĩnh</Link> },
    ],
  },
  {
    key: '/movies',
    icon: <VideoCameraOutlined />,
    label: 'Quản lý phim',
    children: [
      { key: '/movies/single', icon: <UnorderedListOutlined />, label: <Link to="/movies/single">Phim lẻ</Link> },
      { key: '/movies/series', icon: <UnorderedListOutlined />, label: <Link to="/movies/series">Phim bộ</Link> },
      { key: '/movies/hoathinh', icon: <UnorderedListOutlined />, label: <Link to="/movies/hoathinh">Hoạt hình</Link> },
      { key: '/movies/tvshows', icon: <UnorderedListOutlined />, label: <Link to="/movies/tvshows">TV Show</Link> },
    ],
  },
  { key: '/google-sheets', icon: <FileTextOutlined />, label: <Link to="/google-sheets">Google Sheets</Link> },
  { key: '/player-settings', icon: <PlaySquareOutlined />, label: <Link to="/player-settings">Player</Link> },
  { key: '/donate', icon: <DollarOutlined />, label: <Link to="/donate">Donate</Link> },
  { key: '/github-actions', icon: <ThunderboltOutlined />, label: <Link to="/github-actions">GitHub Actions</Link> },
  { key: '/audit-logs', icon: <AuditOutlined />, label: <Link to="/audit-logs">Audit</Link> },
  { key: '/supabase-tools', icon: <ToolOutlined />, label: <Link to="/supabase-tools">Supabase Tools</Link> },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md; // md = 768px and up

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const giaoDienPaths = ['/slider', '/menu-background', '/filter-order', '/homepage-sections', '/category-page-settings', '/theme', '/static-pages'];
    const moviePaths = ['/movies/single', '/movies/series', '/movies/hoathinh', '/movies/tvshows', '/movies/edit', '/movies/episodes'];
    if (giaoDienPaths.includes(location.pathname)) {
      setOpenKeys(['/giao-dien']);
    } else if (moviePaths.some(p => location.pathname.startsWith(p))) {
      setOpenKeys(['/movies']);
    } else if (location.pathname === '/ads' || location.pathname === '/banners' || location.pathname === '/preroll') {
      setOpenKeys(['/ads']);
    } else {
      setOpenKeys([]);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const triggerBuild = async () => {
    try {
      const base = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/trigger-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(async () => ({ error: await res.text() }));
      if (res.ok && data?.ok) {
        message.success('Đã kích hoạt build. GitHub Actions đang chạy.');
      } else {
        message.error(data?.error || data?.message || `Lỗi ${res.status}`);
      }
    } catch (e: any) {
      message.error(e?.message || 'Không kết nối được API. Kiểm tra GITHUB_TOKEN, GITHUB_REPO trên Vercel.');
    }
  };

  const menuContent = (
    <>
      <Menu
        theme="dark"
        selectedKeys={[location.pathname === '/ads' || location.pathname === '/giao-dien' || location.pathname.startsWith('/movies') ? location.pathname : location.pathname]}
        openKeys={openKeys}
        onOpenChange={(keys) => setOpenKeys(keys as string[])}
        mode="inline"
        items={items}
        style={{ borderRight: 0 }}
      />
    </>
  );

  return (
    <AntLayout style={{ minHeight: '100vh' }} className="admin-layout">
      <Header className="admin-header">
        <div className="admin-header-left">
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              aria-label="Mở menu"
              style={{ color: '#fff', fontSize: 18 }}
            />
          )}
          <div className="admin-brand">DAOP Admin</div>
        </div>
        <div className="admin-header-actions">
          <Button type="primary" size={isMobile ? 'small' : 'middle'} onClick={triggerBuild}>
            {isMobile ? 'Build' : 'Build website'}
          </Button>
          <Button icon={<LogoutOutlined />} size={isMobile ? 'small' : 'middle'} onClick={handleLogout}>
            {isMobile ? '' : 'Đăng xuất'}
          </Button>
        </div>
      </Header>

      {isMobile ? (
        <Drawer
          title="Menu"
          placement="left"
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          bodyStyle={{ padding: 0, background: '#001529' }}
          width={280}
          styles={{ header: { background: '#001529', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)' } }}
        >
          {menuContent}
        </Drawer>
      ) : null}

      <AntLayout>
        {isMobile ? null : (
          <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} breakpoint="lg" collapsedWidth={80}>
            {menuContent}
          </Sider>
        )}
        <AntLayout>
          <Content className="admin-content">
            <Outlet />
          </Content>
          <Footer className="admin-footer">
            Code made by <strong>GoTV Admin Tieucot</strong> - Telegram{' '}
            <a href="https://t.me/tieucot520" target="_blank" rel="noopener noreferrer">
              @tieucot520
            </a>
          </Footer>
        </AntLayout>
      </AntLayout>
    </AntLayout>
  );
}
