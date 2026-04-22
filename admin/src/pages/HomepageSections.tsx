import { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Space,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import defaultSectionsJson from '../../../config/default-sections.json';
import { useAdminRole } from '../context/AdminRoleContext';
import { getApiBaseUrl } from '../lib/api';
import { getAdminApiAuthHeaders } from '../lib/adminAuth';

type SectionRow = {
  id: string;
  sort_order: number;
  title: string;
  source_type: string;
  source_value: string;
  limit_count: number;
  more_link?: string;
  display_type?: string;
  is_active: boolean;
  filter_config?: Record<string, unknown> | null;
  grid_columns_xs?: number | null;
  grid_columns_sm?: number | null;
  grid_columns_md?: number | null;
  grid_columns_lg?: number | null;
  use_poster?: boolean | null;
  featured_count_xs?: number | null;
  featured_count_sm?: number | null;
  featured_count_md?: number | null;
  featured_count_lg?: number | null;
  featured_span_xs?: number | null;
  featured_span_sm?: number | null;
  featured_span_md?: number | null;
  featured_span_lg?: number | null;
};

const SOURCE_TYPE_OPTIONS = [
  { value: 'type', label: 'Type (series, single, tvshows, hoathinh)' },
  { value: 'genre', label: 'Thể loại (slug)' },
  { value: 'country', label: 'Quốc gia (slug)' },
  { value: 'year', label: 'Năm phát hành' },
  { value: 'status', label: 'Trạng thái (current, upcoming, theater)' },
  { value: 'quality_4k', label: 'Phim 4K (quality_4k)' },
  { value: 'exclusive', label: 'Phim Độc quyền (exclusive)' },
  { value: 'vietsub', label: 'Phim Vietsub' },
  { value: 'thuyetminh', label: 'Phim Thuyết minh' },
  { value: 'longtieng', label: 'Phim Lồng tiếng' },
];

const DISPLAY_TYPE_OPTIONS = [
  { value: 'grid', label: 'Grid' },
  { value: 'grid_featured', label: 'Grid (Featured)' },
  { value: 'slider', label: 'Slider' },
  { value: 'list', label: 'List' },
];

const COLUMN_COUNT_OPTIONS = [2, 3, 4, 6, 8].map((n) => ({ value: n, label: String(n) }));

const IMAGE_TYPE_OPTIONS = [
  { value: 'vertical', label: 'Dọc (Thumb)' },
  { value: 'horizontal', label: 'Ngang (Poster)' },
];

const DEFAULT_SECTIONS = defaultSectionsJson as Array<Omit<SectionRow, 'id'>>;

export default function HomepageSections() {
  const { isAdmin } = useAdminRole();
  const [data, setData] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<SectionRow>();

  const sourceType = Form.useWatch('source_type', form);
  const displayType = Form.useWatch('display_type', form);
  const sourceValueOptional = ['quality_4k', 'exclusive', 'vietsub', 'thuyetminh', 'longtieng'].includes(
    String(sourceType || '').toLowerCase()
  );

  const loadData = async () => {
    setLoading(true);
    const r = await supabase.from('homepage_sections').select('*').order('sort_order');
    if (!r.error && Array.isArray(r.data)) {
      setData((r.data as SectionRow[]) ?? []);
      setLoading(false);
      return;
    }

    // Non-admin accounts can be blocked by RLS on homepage_sections.
    // Fallback to server-side readonly API (service role) so sections still display.
    try {
      const base = getApiBaseUrl();
      const fallbackRes = await fetch(`${base}/api/admin-readonly?action=sections`, {
        headers: {
          ...(await getAdminApiAuthHeaders()),
        },
      });
      const fallbackJson = await fallbackRes.json().catch(() => ({}));
      const fallbackData = Array.isArray((fallbackJson as any)?.data) ? (fallbackJson as any).data : [];
      if (fallbackRes.ok && fallbackData.length >= 0) {
        setData(fallbackData as SectionRow[]);
        if (r.error) {
          message.warning('Tài khoản đang ở chế độ chỉ xem sections.');
        }
      } else {
        throw new Error((fallbackJson as any)?.error || `HTTP ${fallbackRes.status}`);
      }
    } catch {
      setData([]);
      if (r.error) {
        message.error(r.error.message || 'Không tải được sections');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      sort_order: (data[data.length - 1]?.sort_order ?? 0) + 1,
      limit_count: 24,
      display_type: 'grid',
      is_active: true,
      grid_columns_xs: 2,
      grid_columns_sm: 3,
      grid_columns_md: 4,
      grid_columns_lg: 6,
      use_poster: 'vertical',
      featured_count_xs: 1,
      featured_count_sm: 1,
      featured_count_md: 1,
      featured_count_lg: 2,
      featured_span_xs: 2,
      featured_span_sm: 3,
      featured_span_md: 2,
      featured_span_lg: 3,
    } as any);
    setModalVisible(true);
  };

  const openEdit = (row: SectionRow) => {
    setEditingId(row.id);
    const fc = (row.filter_config as Record<string, unknown>) || {};
    form.setFieldsValue({
      ...row,
      is_active: !!row.is_active,
      grid_columns_xs: row.grid_columns_xs ?? fc.grid_columns_xs ?? 2,
      grid_columns_sm: row.grid_columns_sm ?? fc.grid_columns_sm ?? 3,
      grid_columns_md: row.grid_columns_md ?? fc.grid_columns_md ?? 4,
      grid_columns_lg: row.grid_columns_lg ?? fc.grid_columns_lg ?? 6,
      use_poster: (row.use_poster ?? fc.use_poster) ? 'horizontal' : 'vertical',
      featured_count_xs: (row.featured_count_xs ?? (fc as any).featured_count_xs ?? 0) as any,
      featured_count_sm: (row.featured_count_sm ?? (fc as any).featured_count_sm ?? 0) as any,
      featured_count_md: (row.featured_count_md ?? (fc as any).featured_count_md ?? 0) as any,
      featured_count_lg: (row.featured_count_lg ?? (fc as any).featured_count_lg ?? 0) as any,
      featured_span_xs: (row.featured_span_xs ?? (fc as any).featured_span_xs ?? 2) as any,
      featured_span_sm: (row.featured_span_sm ?? (fc as any).featured_span_sm ?? 3) as any,
      featured_span_md: (row.featured_span_md ?? (fc as any).featured_span_md ?? 4) as any,
      featured_span_lg: (row.featured_span_lg ?? (fc as any).featured_span_lg ?? 4) as any,
    } as any);
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      const existing = editingId ? data.find((d) => d.id === editingId) : null;
      const prevFc = (existing?.filter_config as Record<string, unknown>) || {};
      const filter_config = {
        ...prevFc,
        grid_columns_xs: Number(values.grid_columns_xs ?? 2),
        grid_columns_sm: Number(values.grid_columns_sm ?? 3),
        grid_columns_md: Number(values.grid_columns_md ?? 4),
        grid_columns_lg: Number(values.grid_columns_lg ?? 6),
        use_poster: values.use_poster === 'horizontal',
        featured_count_xs: Number(values.featured_count_xs ?? 0),
        featured_count_sm: Number(values.featured_count_sm ?? 0),
        featured_count_md: Number(values.featured_count_md ?? 0),
        featured_count_lg: Number(values.featured_count_lg ?? 0),
        featured_span_xs: Number(values.featured_span_xs ?? 2),
        featured_span_sm: Number(values.featured_span_sm ?? 3),
        featured_span_md: Number(values.featured_span_md ?? 4),
        featured_span_lg: Number(values.featured_span_lg ?? 4),
      };
      const payload: Record<string, any> = {
        title: values.title,
        source_type: values.source_type,
        source_value: values.source_value,
        display_type: values.display_type || null,
        more_link: values.more_link || null,
        is_active: !!values.is_active,
        sort_order: Number(values.sort_order ?? 0),
        limit_count: Number(values.limit_count ?? 24),
        filter_config,
      };
      if (editingId) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('homepage_sections').update(payload).eq('id', editingId);
        if (error) throw error;
        message.success('Đã cập nhật section');
      } else {
        const { error } = await supabase.from('homepage_sections').insert(payload);
        if (error) throw error;
        message.success('Đã thêm section');
      }
      setModalVisible(false);
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  const toggleActive = async (row: SectionRow) => {
    try {
      const { error } = await supabase
        .from('homepage_sections')
        .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Cập nhật thất bại');
    }
  };

  const changeOrder = async (row: SectionRow, direction: 'up' | 'down') => {
    const index = data.findIndex((d) => d.id === row.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= data.length) return;
    const other = data[targetIndex];
    try {
      const [a, b] = await Promise.all([
        supabase.from('homepage_sections').update({ sort_order: other.sort_order, updated_at: new Date().toISOString() }).eq('id', row.id),
        supabase.from('homepage_sections').update({ sort_order: row.sort_order, updated_at: new Date().toISOString() }).eq('id', other.id),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Đổi thứ tự thất bại');
    }
  };

  const seedDefaults = async () => {
    if (data.length > 0) {
      message.info('Đã có section. Xóa hết trước khi thêm mặc định, hoặc bấm Thêm section.');
      return;
    }
    try {
      await supabase.from('homepage_sections').insert(DEFAULT_SECTIONS);
      message.success('Đã thêm 6 sections mặc định.');
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Lỗi khi thêm sections mặc định');
    }
  };

  return (
    <>
      <h1>Homepage Sections</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Sau khi lưu, cần chạy Build website để áp dụng sections lên trang chủ.
      </p>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} disabled={!isAdmin}>
          Thêm section
        </Button>
        <Button onClick={seedDefaults} disabled={data.length > 0 || !isAdmin}>
          Thêm sections mặc định
        </Button>
      </div>
      <Table
        loading={loading}
        dataSource={data}
        rowKey="id"
        pagination={false}
        columns={[
          { title: 'Thứ tự', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
          { title: 'Tiêu đề', dataIndex: 'title', key: 'title' },
          {
            title: 'Loại nguồn',
            dataIndex: 'source_type',
            key: 'source_type',
            render: (t: string) => <Tag>{t}</Tag>,
          },
          { title: 'Giá trị', dataIndex: 'source_value', key: 'source_value' },
          { title: 'Số lượng', dataIndex: 'limit_count', key: 'limit_count' },
          {
            title: 'Hiển thị',
            dataIndex: 'display_type',
            key: 'display_type',
            render: (t: string) => (t ? <Tag>{t}</Tag> : <Tag>grid</Tag>),
          },
          {
            title: 'Cột (xs/sm/md/lg)',
            key: 'grid_columns',
            width: 120,
            render: (_: any, row: SectionRow) => {
              const fc = (row.filter_config as Record<string, unknown>) || {};
              const xs = Number(row.grid_columns_xs ?? fc.grid_columns_xs ?? 2);
              const sm = Number(row.grid_columns_sm ?? fc.grid_columns_sm ?? 3);
              const md = Number(row.grid_columns_md ?? fc.grid_columns_md ?? 4);
              const lg = Number(row.grid_columns_lg ?? fc.grid_columns_lg ?? 6);
              return <Tag>{xs}/{sm}/{md}/{lg}</Tag>;
            },
          },
          {
            title: 'Ảnh',
            key: 'use_poster',
            width: 70,
            render: (_: any, row: SectionRow) => {
              const fc = (row.filter_config as Record<string, unknown>) || {};
              const v = row.use_poster ?? fc.use_poster;
              return <Tag>{v ? 'Poster' : 'Thumb'}</Tag>;
            },
          },
          {
            title: 'Trạng thái',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (v: boolean) => (
              <Tag color={v ? 'green' : 'default'}>{v ? 'Bật' : 'Tắt'}</Tag>
            ),
          },
          {
            title: '',
            key: 'action',
            width: 220,
            render: (_: any, row: SectionRow, index: number) => (
              <Space>
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={index === 0 || !isAdmin}
                  onClick={() => changeOrder(row, 'up')}
                />
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={index === data.length - 1 || !isAdmin}
                  onClick={() => changeOrder(row, 'down')}
                />
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} disabled={!isAdmin}>
                  Sửa
                </Button>
                <Button size="small" onClick={() => toggleActive(row)} disabled={!isAdmin}>
                  {row.is_active ? 'Tắt' : 'Bật'}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingId ? 'Sửa section' : 'Thêm section'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="source_type"
            label="Loại nguồn"
            rules={[{ required: true }]}
          >
            <Select options={SOURCE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="source_value"
            label="Giá trị (slug hoặc giá trị tương ứng)"
            rules={sourceValueOptional ? [] : [{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="limit_count" label="Số lượng">
            <InputNumber min={1} max={120} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="display_type" label="Kiểu hiển thị">
            <Select allowClear options={DISPLAY_TYPE_OPTIONS} placeholder="Mặc định: grid" />
          </Form.Item>
          {String(displayType || '').toLowerCase() === 'grid_featured' && (
            <>
              <Form.Item name="featured_count_xs" label="Featured - Số phim nổi bật (Mobile nhỏ <480px)">
                <InputNumber min={0} max={6} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="featured_count_sm" label="Featured - Số phim nổi bật (Mobile lớn 480–767px)">
                <InputNumber min={0} max={6} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="featured_count_md" label="Featured - Số phim nổi bật (Tablet 768–1023px)">
                <InputNumber min={0} max={6} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="featured_count_lg" label="Featured - Số phim nổi bật (Desktop 1024px+)">
                <InputNumber min={0} max={6} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="featured_span_xs" label="Featured - Chiếm bao nhiêu cột (Mobile nhỏ <480px)">
                <Select options={COLUMN_COUNT_OPTIONS} />
              </Form.Item>
              <Form.Item name="featured_span_sm" label="Featured - Chiếm bao nhiêu cột (Mobile lớn 480–767px)">
                <Select options={COLUMN_COUNT_OPTIONS} />
              </Form.Item>
              <Form.Item name="featured_span_md" label="Featured - Chiếm bao nhiêu cột (Tablet 768–1023px)">
                <Select options={COLUMN_COUNT_OPTIONS} />
              </Form.Item>
              <Form.Item name="featured_span_lg" label="Featured - Chiếm bao nhiêu cột (Desktop 1024px+)">
                <Select options={COLUMN_COUNT_OPTIONS} />
              </Form.Item>
            </>
          )}
          <Form.Item name="grid_columns_xs" label="Số cột - Mobile nhỏ (&lt;480px)">
            <Select options={COLUMN_COUNT_OPTIONS} />
          </Form.Item>
          <Form.Item name="grid_columns_sm" label="Số cột - Mobile lớn (480–767px)">
            <Select options={COLUMN_COUNT_OPTIONS} />
          </Form.Item>
          <Form.Item name="grid_columns_md" label="Số cột - Tablet (768–1023px)">
            <Select options={COLUMN_COUNT_OPTIONS} />
          </Form.Item>
          <Form.Item name="grid_columns_lg" label="Số cột - Desktop (1024px+)">
            <Select options={COLUMN_COUNT_OPTIONS} />
          </Form.Item>
          <Form.Item name="use_poster" label="Loại ảnh">
            <Select options={IMAGE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="more_link" label='Link "Xem thêm"'>
            <Input placeholder="Ví dụ: /phim-bo.html" />
          </Form.Item>
          <Form.Item name="sort_order" label="Thứ tự">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="Kích hoạt"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
