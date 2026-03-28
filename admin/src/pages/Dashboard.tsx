import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Row, Col, Table, Statistic, Typography, Space, Tag } from 'antd';
import {
  VideoCameraOutlined,
  UnorderedListOutlined,
  PlayCircleOutlined,
  AppstoreOutlined,
  SmileOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const navigate = useNavigate();

  const loadDashboard = useMemo(() => {
    return async () => {
      setLoading(true);
      try {
        const [s, l] = await Promise.all([
          supabase.from('homepage_sections').select('id', { count: 'exact', head: true }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
        ]);

        setStats((prev) => ({
          ...prev,
          sections: (s as any).count ?? 0,
        }));
        setLogs((l as any).data ?? []);

        const base = getApiBaseUrl();

        try {
          const unbuiltUrl = new URL(`${base}/api/movies`);
          unbuiltUrl.searchParams.append('action', 'list');
          unbuiltUrl.searchParams.append('type', 'all');
          unbuiltUrl.searchParams.append('unbuilt', '1');
          unbuiltUrl.searchParams.append('page', '1');
          unbuiltUrl.searchParams.append('limit', '1');

          const duplicatesUrl = new URL(`${base}/api/movies`);
          duplicatesUrl.searchParams.append('action', 'list');
          duplicatesUrl.searchParams.append('type', 'all');
          duplicatesUrl.searchParams.append('duplicates', '1');
          duplicatesUrl.searchParams.append('page', '1');
          duplicatesUrl.searchParams.append('limit', '1');

          const [unbuiltRes, duplicatesRes] = await Promise.all([
            fetch(unbuiltUrl.toString(), { cache: 'no-store' }),
            fetch(duplicatesUrl.toString(), { cache: 'no-store' }),
          ]);

          const unbuiltData = await unbuiltRes.json().catch(async () => ({ error: await unbuiltRes.text() }));
          const duplicatesData = await duplicatesRes
            .json()
            .catch(async () => ({ error: await duplicatesRes.text() }));

          setStats((prev) => ({
            ...prev,
            movies_unbuilt: Number(unbuiltData?.total || 0),
            movies_duplicates: Number(duplicatesData?.total || 0),
          }));
        } catch {
          setStats((prev) => ({
            ...prev,
            movies_unbuilt: prev.movies_unbuilt ?? 0,
            movies_duplicates: prev.movies_duplicates ?? 0,
          }));
        }

        try {
          const totalUrl = new URL(`${base}/api/movies`);
          totalUrl.searchParams.append('action', 'list');
          totalUrl.searchParams.append('type', 'all');
          totalUrl.searchParams.append('page', '1');
          totalUrl.searchParams.append('limit', '1');

          const seriesUrl = new URL(`${base}/api/movies`);
          seriesUrl.searchParams.append('action', 'list');
          seriesUrl.searchParams.append('type', 'series');
          seriesUrl.searchParams.append('page', '1');
          seriesUrl.searchParams.append('limit', '1');

          const singleUrl = new URL(`${base}/api/movies`);
          singleUrl.searchParams.append('action', 'list');
          singleUrl.searchParams.append('type', 'single');
          singleUrl.searchParams.append('page', '1');
          singleUrl.searchParams.append('limit', '1');

          const hoathinhUrl = new URL(`${base}/api/movies`);
          hoathinhUrl.searchParams.append('action', 'list');
          hoathinhUrl.searchParams.append('type', 'hoathinh');
          hoathinhUrl.searchParams.append('page', '1');
          hoathinhUrl.searchParams.append('limit', '1');

          const tvshowsUrl = new URL(`${base}/api/movies`);
          tvshowsUrl.searchParams.append('action', 'list');
          tvshowsUrl.searchParams.append('type', 'tvshows');
          tvshowsUrl.searchParams.append('page', '1');
          tvshowsUrl.searchParams.append('limit', '1');

          const [totalRes, seriesRes, singleRes, hoathinhRes, tvshowsRes] = await Promise.all([
            fetch(totalUrl.toString(), { cache: 'no-store' }),
            fetch(seriesUrl.toString(), { cache: 'no-store' }),
            fetch(singleUrl.toString(), { cache: 'no-store' }),
            fetch(hoathinhUrl.toString(), { cache: 'no-store' }),
            fetch(tvshowsUrl.toString(), { cache: 'no-store' }),
          ]);

          const totalData = await totalRes.json().catch(() => ({}));
          const seriesData = await seriesRes.json().catch(() => ({ total: 0 }));
          const singleData = await singleRes.json().catch(() => ({ total: 0 }));
          const hoathinhData = await hoathinhRes.json().catch(() => ({ total: 0 }));
          const tvshowsData = await tvshowsRes.json().catch(() => ({ total: 0 }));

          const moviesTotal =
            !totalRes.ok || (totalData as any)?.error ? 0 : Number((totalData as any)?.total || 0);
          const moviesSeries = Number(seriesData?.total || 0);
          const moviesSingle = Number(singleData?.total || 0);
          const moviesHoathinh = Number(hoathinhData?.total || 0);
          const moviesTvshows = Number(tvshowsData?.total || 0);

          setStats((prev) => ({
            ...prev,
            movies_total: moviesTotal,
            movies_series: moviesSeries,
            movies_single: moviesSingle,
            movies_hoathinh: moviesHoathinh,
            movies_tvshows: moviesTvshows,
          }));
        } catch {
          setStats((prev) => ({
            ...prev,
            movies_total: prev.movies_total ?? 0,
            movies_series: prev.movies_series ?? 0,
            movies_single: prev.movies_single ?? 0,
            movies_hoathinh: prev.movies_hoathinh ?? 0,
            movies_tvshows: prev.movies_tvshows ?? 0,
          }));
        }

        setLastUpdatedAt(Date.now());
      } finally {
        setLoading(false);
      }
    };
  }, []);

  useEffect(() => {
    loadDashboard();

    const intervalMs = 60_000;
    const t = window.setInterval(() => {
      loadDashboard();
    }, intervalMs);

    return () => {
      window.clearInterval(t);
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
      hint: 'Trên sheet: update=NEW',
      to: '/movies/unbuilt',
    },
    {
      key: 'movies_duplicates',
      title: 'Trùng lặp',
      value: stats.movies_duplicates ?? 0,
      icon: <UnorderedListOutlined />,
      color: '#b37feb',
      hint: 'Trên sheet: update trống nhưng trùng slug hoặc ID',
      to: '/movies/duplicates',
    },
  ];

  function actionColor(a: any): string {
    const s = String(a || '').toLowerCase();
    if (s.includes('delete') || s.includes('remove') || s.includes('xóa')) return 'red';
    if (s.includes('update') || s.includes('edit') || s.includes('sửa')) return 'blue';
    if (s.includes('create') || s.includes('add') || s.includes('thêm')) return 'green';
    return 'default';
  }

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

      <Card
        bordered={false}
        style={{ borderRadius: 12 }}
        title={
          <Space>
            <ClockCircleOutlined />
            <span>Audit log gần đây</span>
          </Space>
        }
      >
        <Table
          dataSource={logs}
          rowKey="id"
          columns={[
            {
              title: 'Thời gian',
              dataIndex: 'created_at',
              key: 'created_at',
              width: 180,
              render: (t: string) => (
                <span style={{ whiteSpace: 'nowrap' }}>{new Date(t).toLocaleString()}</span>
              ),
            },
            {
              title: 'Hành động',
              dataIndex: 'action',
              key: 'action',
              width: 140,
              render: (a: any) => <Tag color={actionColor(a)}>{String(a || '-')}</Tag>,
            },
            {
              title: 'Đối tượng',
              dataIndex: 'entity_type',
              key: 'entity_type',
              width: 160,
              render: (t: any) => <Tag>{String(t || '-')}</Tag>,
            },
            {
              title: 'Chi tiết',
              dataIndex: 'entity_id',
              key: 'entity_id',
              render: (id: any) => {
                const s = String(id || '');
                if (!s) return '-';
                return <span title={s}>{s.length > 28 ? s.slice(0, 28) + '…' : s}</span>;
              },
            },
          ]}
          pagination={false}
          size="small"
          scroll={{ x: 400 }}
        />
      </Card>
    </>
  );
}
