import { useEffect, useRef, useState } from 'react';
import { Button, Card, Row, Col, Statistic, Typography, Space } from 'antd';
import {
  VideoCameraOutlined,
  UnorderedListOutlined,
  PlayCircleOutlined,
  AppstoreOutlined,
  SmileOutlined,
  DesktopOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { getApiBaseUrl } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const statsRef = useRef<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const navigate = useNavigate();

  const refreshMovieStats = async (force: boolean) => {
    const base = getApiBaseUrl();
    const statsUrl = new URL(`${base}/api/movies`);
    statsUrl.searchParams.append('action', 'dashboardStats');

    const res = await fetch(statsUrl.toString(), { cache: 'no-store' });
    const data = await res.json().catch(async () => ({ error: await res.text() }));
    if (!res.ok) return;

    const changed = !!data?.changed;
    const nextStats = data?.stats;
    if (!nextStats || typeof nextStats !== 'object') return;

    const hasStats = Object.keys(statsRef.current || {}).length > 0;
    if (force || changed || !hasStats) {
      const merged = { ...statsRef.current, ...(nextStats as Record<string, number>) };
      statsRef.current = merged;
      setStats(merged);
      if (force || changed || !hasStats) setLastUpdatedAt(Date.now());
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      await refreshMovieStats(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMovieStats(true);

    const intervalMs = 60_000;
    const tMovies = window.setInterval(() => refreshMovieStats(false), intervalMs);

    return () => {
      window.clearInterval(tMovies);
    };
  }, []);

  const statCards: Array<{
    key: string;
    title: string;
    value: number;
    icon: any;
    color: string;
    hint: string;
    to?: string;
  }> = [
    {
      key: 'movies_total',
      title: 'Tổng số phim',
      value: stats.movies_total ?? 0,
      icon: <VideoCameraOutlined />,
      color: '#1677ff',
      hint: 'Tổng số phim trên website',
    },
    {
      key: 'movies_series',
      title: 'Phim bộ',
      value: stats.movies_series ?? 0,
      icon: <UnorderedListOutlined />,
      color: '#13c2c2',
      hint: 'Số phim bộ',
    },
    {
      key: 'movies_single',
      title: 'Phim lẻ',
      value: stats.movies_single ?? 0,
      icon: <PlayCircleOutlined />,
      color: '#52c41a',
      hint: 'Số phim lẻ',
    },
    {
      key: 'movies_hoathinh',
      title: 'Hoạt hình',
      value: stats.movies_hoathinh ?? 0,
      icon: <SmileOutlined />,
      color: '#faad14',
      hint: 'Số phim hoạt hình',
    },
    {
      key: 'movies_tvshows',
      title: 'TV Shows',
      value: stats.movies_tvshows ?? 0,
      icon: <DesktopOutlined />,
      color: '#722ed1',
      hint: 'Số TV Shows',
    },
    {
      key: 'sections',
      title: 'Homepage Sections',
      value: stats.sections ?? 0,
      icon: <AppstoreOutlined />,
      color: '#eb2f96',
      hint: 'Số section trang chủ',
    },
    {
      key: 'movies_unbuilt',
      title: 'Phim chưa build',
      value: stats.movies_unbuilt ?? 0,
      icon: <UnorderedListOutlined />,
      color: '#ff4d4f',
      hint: 'Trong DB: cột update = NEW',
      to: '/movies/unbuilt',
    },
    {
      key: 'movies_duplicates',
      title: 'Trùng lặp',
      value: stats.movies_duplicates ?? 0,
      icon: <UnorderedListOutlined />,
      color: '#b37feb',
      hint: 'Cột update trống nhưng trùng slug hoặc ID',
      to: '/movies/duplicates',
    },
  ];

  return (
    <>
      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 16 }}>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Typography.Title level={2} style={{ margin: 0 }}>
              Dashboard
            </Typography.Title>
            <Typography.Text type="secondary">
              Tổng quan nhanh về nội dung và thay đổi gần đây
            </Typography.Text>
          </div>
          <Space direction="vertical" size={2} style={{ alignItems: 'flex-end' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadDashboard}
              loading={loading}
            >
              Tải lại
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {lastUpdatedAt ? `Cập nhật: ${new Date(lastUpdatedAt).toLocaleTimeString()}` : ''}
            </Typography.Text>
          </Space>
        </Space>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {statCards.map((c) => (
          <Col key={c.key} xs={24} sm={12} lg={8}>
            <Card
              bordered={false}
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                background:
                  'linear-gradient(135deg, rgba(22,119,255,0.12) 0%, rgba(255,255,255,1) 55%)',
                cursor: c.to ? 'pointer' : 'default',
              }}
              bodyStyle={{ padding: 16 }}
              onClick={c.to ? () => navigate(c.to as string) : undefined}
            >
              <Space align="start" size={12} style={{ width: '100%', justifyContent: 'space-between' }}>
                <div>
                  <Typography.Text type="secondary">{c.hint}</Typography.Text>
                  <Statistic
                    title={c.title}
                    value={c.value}
                    valueStyle={{ fontSize: 30, fontWeight: 700, color: c.color, lineHeight: '34px' }}
                  />
                </div>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: c.color,
                    color: '#fff',
                    fontSize: 20,
                    flex: '0 0 auto',
                  }}
                >
                  {c.icon}
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
