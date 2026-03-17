import { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Statistic, Typography, Space, Tag } from 'antd';
import {
  VideoCameraOutlined,
  UnorderedListOutlined,
  PlayCircleOutlined,
  AppstoreOutlined,
  SmileOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('homepage_sections').select('id', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
    ]).then(([s, l]) => {
      setStats({
        sections: (s as any).count ?? 0,
      });
      setLogs((l as any).data ?? []);
    }).catch(() => {});

    (async () => {
      try {
        const r = await supabase.from('site_settings').select('key, value').in('key', ['site_url']).limit(1);
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
        const asArr = (x: any) => Array.isArray(x) ? x : [];
        const series = asArr(typeMap && typeMap.series);
        const single = asArr(typeMap && (typeMap.single || typeMap.movie || typeMap.le));
        const hoathinh = asArr(typeMap && (typeMap.hoathinh || typeMap.cartoon));
        const tvshows = asArr(typeMap && (typeMap.tvshows || typeMap.tvshow));
        const all = new Set<string>();
        [series, single, hoathinh, tvshows].forEach((arr) => (arr || []).forEach((id: any) => all.add(String(id))));
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
    })();
  }, []);

  const statCards: Array<{
    key: string;
    title: string;
    value: number;
    icon: any;
    color: string;
    hint: string;
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
        <Typography.Title level={2} style={{ margin: 0 }}>
          Dashboard
        </Typography.Title>
        <Typography.Text type="secondary">
          Tổng quan nhanh về nội dung và thay đổi gần đây
        </Typography.Text>
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
              }}
              bodyStyle={{ padding: 16 }}
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
