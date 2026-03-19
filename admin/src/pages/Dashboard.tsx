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
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [serviceAccountKey, setServiceAccountKey] = useState<string>('');
  const navigate = useNavigate();

  const loadDashboard = useMemo(() => {
    return async () => {
      setLoading(true);
      try {
        const [s, l, conf] = await Promise.all([
          supabase.from('homepage_sections').select('id', { count: 'exact', head: true }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
          supabase
            .from('site_settings')
            .select('key, value')
            .in('key', ['google_sheets_id', 'google_service_account_key']),
        ]);

        setStats((prev) => ({
          ...prev,
          sections: (s as any).count ?? 0,
        }));
        setLogs((l as any).data ?? []);

        let sidResolved = String(spreadsheetId || '').trim();
        let sakResolved = String(serviceAccountKey || '').trim();
        try {
          const rows = (conf as any).data ?? [];
          const map = (rows || []).reduce((acc: Record<string, any>, row: any) => {
            acc[row.key] = row.value;
            return acc;
          }, {});
          if (!sidResolved && map.google_sheets_id) sidResolved = String(map.google_sheets_id).trim();
          if (!sakResolved && map.google_service_account_key) sakResolved = String(map.google_service_account_key).trim();
        } catch {
          // ignore
        }

        if (!sidResolved || !sakResolved) {
          try {
            const saved = JSON.parse(localStorage.getItem('daop_google_sheets_config') || '{}');
            if (!sidResolved && saved?.google_sheets_id) sidResolved = String(saved.google_sheets_id).trim();
            if (!sakResolved && saved?.google_service_account_key) sakResolved = String(saved.google_service_account_key).trim();
          } catch {
            // ignore
          }
        }

        if (sidResolved && sidResolved !== spreadsheetId) setSpreadsheetId(sidResolved);
        if (sakResolved && sakResolved !== serviceAccountKey) setServiceAccountKey(sakResolved);

        try {
          const sid = sidResolved || '';
          const sak = sakResolved || '';
          if (sid) {
            const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
            const base = envBase || window.location.origin;

            const unbuiltUrl = new URL(`${base}/api/movies`);
            unbuiltUrl.searchParams.append('action', 'list');
            unbuiltUrl.searchParams.append('type', 'all');
            unbuiltUrl.searchParams.append('unbuilt', '1');
            unbuiltUrl.searchParams.append('page', '1');
            unbuiltUrl.searchParams.append('limit', '1');
            unbuiltUrl.searchParams.append('spreadsheetId', sid);
            if (sak) unbuiltUrl.searchParams.append('serviceAccountKey', sak);

            const normalizeUrl = new URL(`${base}/api/movies`);
            normalizeUrl.searchParams.append('action', 'list');
            normalizeUrl.searchParams.append('type', 'all');
            normalizeUrl.searchParams.append('copyOnly', '1');
            normalizeUrl.searchParams.append('page', '1');
            normalizeUrl.searchParams.append('limit', '1');
            normalizeUrl.searchParams.append('spreadsheetId', sid);
            if (sak) normalizeUrl.searchParams.append('serviceAccountKey', sak);

            const duplicatesUrl = new URL(`${base}/api/movies`);
            duplicatesUrl.searchParams.append('action', 'list');
            duplicatesUrl.searchParams.append('type', 'all');
            duplicatesUrl.searchParams.append('duplicates', '1');
            duplicatesUrl.searchParams.append('page', '1');
            duplicatesUrl.searchParams.append('limit', '1');
            duplicatesUrl.searchParams.append('spreadsheetId', sid);
            if (sak) duplicatesUrl.searchParams.append('serviceAccountKey', sak);

            const [unbuiltRes, normalizeRes, duplicatesRes] = await Promise.all([
              fetch(unbuiltUrl.toString(), { cache: 'no-store' }),
              fetch(normalizeUrl.toString(), { cache: 'no-store' }),
              fetch(duplicatesUrl.toString(), { cache: 'no-store' }),
            ]);

            const unbuiltData = await unbuiltRes.json().catch(async () => ({ error: await unbuiltRes.text() }));
            const normalizeData = await normalizeRes
              .json()
              .catch(async () => ({ error: await normalizeRes.text() }));
            const duplicatesData = await duplicatesRes
              .json()
              .catch(async () => ({ error: await duplicatesRes.text() }));

            setStats((prev) => ({
              ...prev,
              movies_unbuilt: Number(unbuiltData?.total || 0),
              movies_normalize: Number(normalizeData?.total || 0),
              movies_duplicates: Number(duplicatesData?.total || 0),
            }));
          }
        } catch {
          setStats((prev) => ({
            ...prev,
            movies_unbuilt: prev.movies_unbuilt ?? 0,
            movies_normalize: prev.movies_normalize ?? 0,
            movies_duplicates: prev.movies_duplicates ?? 0,
          }));
        }

        try {
          const r = await supabase
            .from('site_settings')
            .select('key, value')
            .in('key', ['site_url'])
            .limit(1);
          const rows = (r as any).data ?? [];
          const map = (rows || []).reduce((acc: Record<string, any>, row: any) => {
            acc[row.key] = row.value;
            return acc;
          }, {});
          const baseRaw = String(map.site_url || window.location.origin || '').replace(/\/$/, '');
          const url = baseRaw + '/data/filters.js';
          const text = await fetch(url, { cache: 'no-store' }).then((res) => res.text());
          const sandbox: any = {};
          const data = new Function('window', text + '; return window.filtersData;')(sandbox);
          const typeMap = data && typeof data === 'object' ? (data as any).typeMap : null;
          const asArr = (x: any) => (Array.isArray(x) ? x : []);
          const series = asArr(typeMap && typeMap.series);
          const single = asArr(typeMap && (typeMap.single || typeMap.movie || typeMap.le));
          const hoathinh = asArr(typeMap && (typeMap.hoathinh || typeMap.cartoon));
          const tvshows = asArr(typeMap && (typeMap.tvshows || typeMap.tvshow));
          const all = new Set<string>();
          [series, single, hoathinh, tvshows].forEach((arr) =>
            (arr || []).forEach((id: any) => all.add(String(id)))
          );

          setStats((prev) => ({
            ...prev,
            movies_total: all.size,
            movies_series: series.length,
            movies_single: single.length,
            movies_hoathinh: hoathinh.length,
            movies_tvshows: tvshows.length,
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
      hint: 'Trên sheet: update=NEW (hoặc NEW2)',
      to: '/movies/unbuilt',
    },
    {
      key: 'movies_normalize',
      title: 'Cần chuẩn hóa',
      value: stats.movies_normalize ?? 0,
      icon: <UnorderedListOutlined />,
      color: '#faad14',
      hint: 'Trên sheet: update=COPY (hoặc COPY2)',
      to: '/movies/normalize',
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
