import { useEffect, useState } from 'react';
import { Card, Row, Col, Table } from 'antd';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('ad_banners').select('id', { count: 'exact', head: true }),
      supabase.from('homepage_sections').select('id', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
    ]).then(([b, s, l]) => {
      setStats({
        banners: (b as any).count ?? 0,
        sections: (s as any).count ?? 0,
      });
      setLogs((l as any).data ?? []);
    }).catch(() => {});
  }, []);

  return (
    <>
      <h1>Dashboard</h1>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={24} md={8}>
          <Card title="Banner" extra={stats.banners}>Số lượng banner quảng cáo</Card>
        </Col>
        <Col xs={24} sm={24} md={8}>
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
