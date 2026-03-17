import { useEffect, useState } from 'react';
import { Card, Row, Col, Table } from 'antd';
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

  return (
    <>
      <h1>Dashboard</h1>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card title="Tổng số phim" extra={stats.movies_total ?? 0}>Tổng số phim trên website</Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card title="Phim bộ" extra={stats.movies_series ?? 0}>Số phim bộ</Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card title="Phim lẻ" extra={stats.movies_single ?? 0}>Số phim lẻ</Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card title="Hoạt hình" extra={stats.movies_hoathinh ?? 0}>Số phim hoạt hình</Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card title="TV Shows" extra={stats.movies_tvshows ?? 0}>Số TV Shows</Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card title="Homepage Sections" extra={stats.sections}>Số section trang chủ</Card>
        </Col>
      </Row>
      <Card title="Audit log gần đây">
        <Table
          dataSource={logs}
          rowKey="id"
          columns={[
            { title: 'Thời gian', dataIndex: 'created_at', key: 'created_at', render: (t: string) => new Date(t).toLocaleString() },
            { title: 'Hành động', dataIndex: 'action', key: 'action' },
            { title: 'Đối tượng', dataIndex: 'entity_type', key: 'entity_type' },
            { title: 'Chi tiết', dataIndex: 'entity_id', key: 'entity_id' },
          ]}
          pagination={false}
          size="small"
          scroll={{ x: 400 }}
        />
      </Card>
    </>
  );
}
