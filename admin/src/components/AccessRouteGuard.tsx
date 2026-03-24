import { Button, Result } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { useAccess } from '../context/AccessContext';

const PROTECTED_PREFIXES = ['/ads', '/banners', '/preroll', '/movies', '/supabase-tools'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function AccessRouteGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { hasAccess, setUnlockModalOpen } = useAccess();

  if (!hasAccess && isProtectedPath(pathname)) {
    return (
      <div style={{ padding: 48 }}>
        <Result
          icon={<LockOutlined style={{ color: '#faad14' }} />}
          title="Khu vực truy cập"
          subTitle="Quảng cáo, Quản lý phim và Supabase Tools cần nhập mã kích hoạt."
          extra={
            <Button type="primary" onClick={() => setUnlockModalOpen(true)}>
              Nhập mã kích hoạt
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
