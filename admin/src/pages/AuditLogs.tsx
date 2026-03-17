import { useEffect, useState } from 'react';
import {
  Table,
  Space,
  Typography,
  Tag,
  Button,
  Input,
  Select,
  DatePicker,
  Modal,
  message,
  Drawer,
} from 'antd';
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';

const { RangePicker } = DatePicker;

export default function AuditLogs() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const loadData = async (opts?: { nextPage?: number; nextPageSize?: number }) => {
    setLoading(true);
    try {
      const p = opts?.nextPage ?? page;
      const ps = opts?.nextPageSize ?? pageSize;
      const from = (p - 1) * ps;
      const to = from + ps - 1;

      let q = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filterAction) q = q.eq('action', filterAction);
      if (filterEntity) q = q.eq('entity_type', filterEntity);

      const s = search.trim();
      if (s) {
        const esc = s.replace(/,/g, ' ');
        q = q.or(`action.ilike.%${esc}%,entity_type.ilike.%${esc}%,entity_id.ilike.%${esc}%`);
      }

      try {
        if (dateRange && Array.isArray(dateRange) && dateRange[0] && dateRange[1]) {
          const start = dateRange[0].startOf('day').toISOString();
          const end = dateRange[1].endOf('day').toISOString();
          q = q.gte('created_at', start).lte('created_at', end);
        }
      } catch {}

      const r: any = await q.range(from, to);
      if (r.error) throw r.error;
      setData(r.data ?? []);
      setTotal(typeof r.count === 'number' ? r.count : 0);
    } finally {
      setLoading(false);
    }
  };

  function actionColor(a: any): string {
    const s = String(a || '').toLowerCase();
    if (s.includes('delete') || s.includes('remove') || s.includes('xóa')) return 'red';
    if (s.includes('update') || s.includes('edit') || s.includes('sửa')) return 'blue';
    if (s.includes('insert') || s.includes('create') || s.includes('add') || s.includes('thêm')) return 'green';
    return 'default';
  }

  function shortId(v: any, n = 10): string {
    const s = String(v || '');
    if (!s) return '';
    if (s.length <= n * 2 + 3) return s;
    return s.slice(0, n) + '…' + s.slice(-n);
  }

  const actionOptions = [
    { value: 'INSERT', label: 'INSERT' },
    { value: 'UPDATE', label: 'UPDATE' },
    { value: 'DELETE', label: 'DELETE' },
  ];

  const deleteOlderThanDays = async (days: number) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    Modal.confirm({
      title: `Xóa log cũ hơn ${days} ngày?`,
      content: 'Thao tác này không thể hoàn tác.',
      okText: 'Xóa',
      okButtonProps: { danger: true },
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          setLoading(true);
          const r: any = await supabase.from('audit_logs').delete({ count: 'exact' }).lt('created_at', cutoff);
          if (r.error) throw r.error;
          const c = typeof r.count === 'number' ? r.count : null;
          message.success(c != null ? `Đã xóa ${c} log` : 'Đã xóa log');

          setPage(1);
          await loadData({ nextPage: 1 });
        } catch (e: any) {
          message.error(e?.message || 'Xóa thất bại');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const deleteAll = async () => {
    Modal.confirm({
      title: 'Xóa tất cả audit logs?',
      content: 'Thao tác này không thể hoàn tác.',
      okText: 'Xóa tất cả',
      okButtonProps: { danger: true },
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          setLoading(true);
          const r: any = await supabase
            .from('audit_logs')
            .delete({ count: 'exact' })
            .gte('created_at', '1970-01-01T00:00:00.000Z');
          if (r.error) throw r.error;
          const c = typeof r.count === 'number' ? r.count : null;
          message.success(c != null ? `Đã xóa ${c} log` : 'Đã xóa toàn bộ log');

          setPage(1);
          await loadData({ nextPage: 1 });
        } catch (e: any) {
          message.error(e?.message || 'Xóa thất bại');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  useEffect(() => {
    loadData({ nextPage: 1 });
    setPage(1);
  }, [filterAction, filterEntity, dateRange]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadData({ nextPage: 1 });
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const openDetail = (row: any) => {
    setSelected(row);
    setDrawerOpen(true);
  };

  return (
    <>
      <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 12 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Nhật ký (Audit Logs)
        </Typography.Title>
        <Typography.Text type="secondary">
          Theo dõi thao tác tạo/sửa/xóa dữ liệu trong Admin
        </Typography.Text>
      </Space>

      <CardLikeToolbar>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Input
              allowClear
              placeholder="Tìm theo action / entity / entity_id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="Lọc action"
              value={filterAction || undefined}
              onChange={(v: string | undefined) => setFilterAction(v || '')}
              options={actionOptions}
              style={{ width: 180 }}
              showSearch
              optionFilterProp="label"
            />
            <Select
              allowClear
              placeholder="Lọc đối tượng"
              value={filterEntity || undefined}
              onChange={(v: string | undefined) => setFilterEntity(v || '')}
              options={[
                { value: 'ad_banners', label: 'ad_banners' },
                { value: 'ad_preroll', label: 'ad_preroll' },
                { value: 'homepage_sections', label: 'homepage_sections' },
                { value: 'server_sources', label: 'server_sources' },
                { value: 'site_settings', label: 'site_settings' },
                { value: 'static_pages', label: 'static_pages' },
                { value: 'donate_settings', label: 'donate_settings' },
                { value: 'player_settings', label: 'player_settings' },
              ]}
              style={{ width: 200 }}
              showSearch
              optionFilterProp="label"
            />
            <RangePicker
              value={dateRange}
              onChange={(v) => setDateRange(v)}
              allowEmpty={[true, true]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => loadData()} loading={loading}>
              Tải lại
            </Button>
          </Space>

          <Space wrap>
            <Button danger icon={<DeleteOutlined />} onClick={() => deleteOlderThanDays(30)}>
              Xóa &gt; 30 ngày
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={() => deleteOlderThanDays(90)}>
              Xóa &gt; 90 ngày
            </Button>
          </Space>
        </Space>
      </CardLikeToolbar>

      <Table
        loading={loading}
        dataSource={data}
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
            width: 120,
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
            title: 'Entity ID',
            dataIndex: 'entity_id',
            key: 'entity_id',
            render: (id: any) => {
              const s = String(id || '');
              if (!s) return '-';
              return <span title={s}>{shortId(s, 12)}</span>;
            },
          },
          {
            title: 'User',
            dataIndex: 'user_id',
            key: 'user_id',
            width: 220,
            render: (id: any) => {
              const s = String(id || '');
              if (!s) return '-';
              return <span title={s}>{shortId(s, 10)}</span>;
            },
          },
          {
            title: '',
            key: 'view',
            width: 90,
            render: (_: any, row: any) => (
              <Button size="small" onClick={() => openDetail(row)}>
                Xem
              </Button>
            ),
          },
        ]}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (t: number) => `Tổng ${t} log`,
          onChange: (p: number, ps: number) => {
            setPage(p);
            setPageSize(ps);
            loadData({ nextPage: p, nextPageSize: ps });
          },
        }}
        size="small"
        scroll={{ x: 1000 }}
      />

      <Drawer
        title="Chi tiết log"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={720}
      >
        {selected ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={actionColor(selected.action)}>{String(selected.action || '-')}</Tag>
              <Tag>{String(selected.entity_type || '-')}</Tag>
              <Typography.Text type="secondary">{new Date(selected.created_at).toLocaleString()}</Typography.Text>
            </Space>

            <div>
              <Typography.Text strong>Entity ID</Typography.Text>
              <div style={{ wordBreak: 'break-all' }}>{String(selected.entity_id || '-')}</div>
            </div>

            <div>
              <Typography.Text strong>User</Typography.Text>
              <div style={{ wordBreak: 'break-all' }}>{String(selected.user_id || '-')}</div>
            </div>

            {!!selected.old_data && (
              <div>
                <Typography.Text strong>Old data</Typography.Text>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(selected.old_data, null, 2)}</pre>
              </div>
            )}
            {!!selected.new_data && (
              <div>
                <Typography.Text strong>New data</Typography.Text>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(selected.new_data, null, 2)}</pre>
              </div>
            )}
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}

function CardLikeToolbar({ children }: { children: any }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
