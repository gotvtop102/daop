import { useState, useEffect, useMemo } from 'react';
import { Layout as AntLayout, Menu, Button, message, Drawer, Grid, Modal, Input } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/api';
import { useAccess } from '../context/AccessContext';
import { setAccessEnabled } from '../lib/accessGate';
import type { MenuProps } from 'antd';
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

function navLabel(to: string, text: string, locked: boolean) {
  if (locked) {
    return (
      <span style={{ cursor: 'not-allowed', opacity: 0.45 }} title="Cần kích hoạt">
        {text}
      </span>
    );
  }
  return <Link to={to}>{text}</Link>;
}

function buildMenuItems(hasAccess: boolean): MenuProps['items'] {
  const L = (to: string, text: string, locked: boolean) => navLabel(to, text, locked);
  return [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    {
      key: '/ads',
      icon: <PictureOutlined />,
      disabled: !hasAccess,
      label: L('/ads', 'Quảng cáo', !hasAccess),
      children: [
        {
          key: '/banners',
          icon: <PictureOutlined />,
          disabled: !hasAccess,
          label: L('/banners', 'Banner', !hasAccess),
        },
        {
          key: '/preroll',
          icon: <PlaySquareOutlined />,
          disabled: !hasAccess,
          label: L('/preroll', 'Video Ads (Pre/Mid/Post)', !hasAccess),
        },
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
        {
          key: '/category-page-settings',
          icon: <AppstoreOutlined />,
          label: <Link to="/category-page-settings">Trang danh mục</Link>,
        },
        { key: '/theme', icon: <SettingOutlined />, label: <Link to="/theme">Theme</Link> },
        { key: '/static-pages', icon: <FileTextOutlined />, label: <Link to="/static-pages">Trang tĩnh</Link> },
      ],
    },
    { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Cài đặt</Link> },
    {
      key: '/movies',
      icon: <VideoCameraOutlined />,
      disabled: !hasAccess,
      label: hasAccess ? 'Quản lý phim' : <span style={{ opacity: 0.45 }}>Quản lý phim</span>,
      children: [
        { key: '/movies/single', icon: <UnorderedListOutlined />, disabled: !hasAccess, label: L('/movies/single', 'Phim lẻ', !hasAccess) },
        { key: '/movies/series', icon: <UnorderedListOutlined />, disabled: !hasAccess, label: L('/movies/series', 'Phim bộ', !hasAccess) },
        { key: '/movies/hoathinh', icon: <UnorderedListOutlined />, disabled: !hasAccess, label: L('/movies/hoathinh', 'Hoạt hình', !hasAccess) },
        { key: '/movies/tvshows', icon: <UnorderedListOutlined />, disabled: !hasAccess, label: L('/movies/tvshows', 'TV Show', !hasAccess) },
        { key: '/movies/unbuilt', icon: <UnorderedListOutlined />, disabled: !hasAccess, label: L('/movies/unbuilt', 'Phim chưa build', !hasAccess) },
        { key: '/movies/duplicates', icon: <UnorderedListOutlined />, disabled: !hasAccess, label: L('/movies/duplicates', 'Trùng lặp', !hasAccess) },
      ],
    },
    { key: '/player-settings', icon: <PlaySquareOutlined />, label: <Link to="/player-settings">Player</Link> },
    { key: '/donate', icon: <DollarOutlined />, label: <Link to="/donate">Donate</Link> },
    { key: '/github-actions', icon: <ThunderboltOutlined />, label: <Link to="/github-actions">GitHub Actions</Link> },
    { key: '/audit-logs', icon: <AuditOutlined />, label: <Link to="/audit-logs">Audit</Link> },
    {
      key: '/supabase-tools',
      icon: <ToolOutlined />,
      disabled: !hasAccess,
      label: L('/supabase-tools', 'Supabase Tools', !hasAccess),
    },
  ];
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md; // md = 768px and up
  const { hasAccess, unlockModalOpen, setUnlockModalOpen, submitCode } = useAccess();
  const [codeInput, setCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const items = useMemo(() => buildMenuItems(hasAccess), [hasAccess]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const giaoDienPaths = ['/slider', '/menu-background', '/filter-order', '/homepage-sections', '/category-page-settings', '/theme', '/static-pages'];
    const moviePaths = ['/movies/single', '/movies/series', '/movies/hoathinh', '/movies/tvshows', '/movies/unbuilt', '/movies/duplicates', '/movies/edit', '/movies/episodes'];
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
    setAccessEnabled(false);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const triggerBuild = async () => {
    try {
      const base = getApiBaseUrl();
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
          {hasAccess ? (
            <Button size={isMobile ? 'small' : 'middle'} style={{ color: '#faad14', borderColor: '#d4af37' }} disabled>
              Vip
            </Button>
          ) : (
            <Button size={isMobile ? 'small' : 'middle'} type="default" onClick={() => setUnlockModalOpen(true)}>
              Active
            </Button>
          )}
          <Button type="primary" size={isMobile ? 'small' : 'middle'} onClick={triggerBuild}>
            {isMobile ? 'Build' : 'Build website'}
          </Button>
          <Button icon={<LogoutOutlined />} size={isMobile ? 'small' : 'middle'} onClick={handleLogout}>
            {isMobile ? '' : 'Đăng xuất'}
          </Button>
        </div>
      </Header>

      <Modal
        title="Kích hoạt"
        open={unlockModalOpen}
        onCancel={() => {
          setUnlockModalOpen(false);
          setCodeInput('');
        }}
        okText="Kích hoạt"
        confirmLoading={submitting}
        onOk={async () => {
          setSubmitting(true);
          try {
            const r = await submitCode(codeInput);
            if (r.ok) {
              message.success('Đã kích hoạt');
              setCodeInput('');
              return;
            }
            message.error(r.message || 'Không kích hoạt được');
            return Promise.reject();
          } finally {
            setSubmitting(false);
          }
        }}
        destroyOnClose
      >
        <p style={{ marginBottom: 8 }}>Nhập khóa để mở Quảng cáo, Quản lý phim và Supabase Tools.</p>
        <Input.Password
          placeholder="Khóa kích hoạt"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
        />
      </Modal>

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
