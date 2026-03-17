import { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Image,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Switch,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';

type BannerRow = {
  id: string;
  title: string;
  image_url: string | null;
  link_url: string | null;
  html_code: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  priority: number | null;
};

function splitPositions(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  return String(v)
    .split(',')
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

function joinPositions(arr: any): string {
  const list = splitPositions(arr);
  return list.join(',');
}

const POSITION_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'home_top', label: 'Trang chủ - Top (home_top)' },
  { value: 'home_mid', label: 'Trang chủ - Giữa (home_mid)' },
  { value: 'category_top', label: 'Danh mục - Top (category_top)' },
  { value: 'category_mid', label: 'Danh mục - Giữa (category_mid)' },
  { value: 'detail_top', label: 'Chi tiết - Top (detail_top)' },
  { value: 'detail_mid', label: 'Chi tiết - Giữa (detail_mid)' },
  { value: 'watch_top', label: 'Xem phim - Top (watch_top)' },
  { value: 'watch_mid', label: 'Xem phim - Giữa (watch_mid)' },
];

export default function Banners() {
  const [data, setData] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [positionOptions, setPositionOptions] = useState<Array<{ value: string; label: string }>>(POSITION_PRESETS);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    const r = await supabase
      .from('ad_banners')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    setData((r.data as BannerRow[]) ?? []);
    try {
      const rows = (r.data as BannerRow[]) ?? [];
      const allPositions = rows.flatMap((x) => splitPositions(x?.position));
      const extra = Array.from(new Set(allPositions))
        .filter((p) => !POSITION_PRESETS.some((o) => o.value === p))
        .map((p) => ({ value: p, label: `Khác (${p})` }));
      setPositionOptions([...POSITION_PRESETS, ...extra]);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleActive = async (row: BannerRow) => {
    try {
      const { error } = await supabase.from('ad_banners').update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Cập nhật thất bại');
    }
  };

  const openAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      priority: 0,
      position: ['home_top'],
    });
    setModalVisible(true);
  };

  const openEdit = (row: BannerRow) => {
    setEditingId(row.id);
    const { start_date, end_date, ...rest } = row;
    form.setFieldsValue({
      ...rest,
      position: splitPositions(row.position),
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa banner này?')) return;
    try {
      const { error } = await supabase.from('ad_banners').delete().eq('id', id);
      if (error) throw error;
      message.success('Đã xóa banner');
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Xóa thất bại');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const posList = splitPositions(values.position);
      const toSave: any = {
        title: values.title,
        image_url: values.image_url || null,
        link_url: values.link_url || null,
        html_code: values.html_code || null,
        position: joinPositions(posList.length ? posList : ['home_top']),
        is_active: !!values.is_active,
        priority: typeof values.priority === 'number' ? values.priority : 0,
        start_date:
          values.start_date && typeof values.start_date.format === 'function'
            ? values.start_date.format('YYYY-MM-DD')
            : null,
        end_date:
          values.end_date && typeof values.end_date.format === 'function'
            ? values.end_date.format('YYYY-MM-DD')
            : null,
      };
      if (editingId) {
        toSave.updated_at = new Date().toISOString();
        const { error } = await supabase.from('ad_banners').update(toSave).eq('id', editingId);
        if (error) throw error;
        message.success('Đã cập nhật banner');
      } else {
        const { error } = await supabase.from('ad_banners').insert(toSave);
        if (error) throw error;
        message.success('Đã thêm banner');
      }
      setModalVisible(false);
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  return (
    <>
      <h1>Quản lý quảng cáo / Banner</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Sau khi lưu, cần chạy Build website để áp dụng banner lên site.
      </p>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Thêm banner
        </Button>
      </div>
      <Table
        loading={loading}
        dataSource={data}
        rowKey="id"
        columns={[
          {
            title: 'Ảnh',
            dataIndex: 'image_url',
            key: 'img',
            render: (url: string) =>
              url ? (
                <Image
                  src={url}
                  width={80}
                  height={45}
                  style={{ objectFit: 'cover' }}
                  alt=""
                />
              ) : (
                '-'
              ),
          },
          { title: 'Tiêu đề', dataIndex: 'title', key: 'title' },
          {
            title: 'Vị trí',
            dataIndex: 'position',
            key: 'position',
            render: (v: string) => {
              const list = splitPositions(v);
              if (!list.length) return '-';
              return (
                <Space wrap>
                  {list.map((p) => (
                    <Tag key={p}>{p}</Tag>
                  ))}
                </Space>
              );
            },
          },
          { title: 'Ưu tiên', dataIndex: 'priority', key: 'priority', width: 80 },
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
            render: (_: any, row: BannerRow) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
                  Sửa
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(row.id)}>
                  Xóa
                </Button>
                <Button size="small" onClick={() => toggleActive(row)}>
                  {row.is_active ? 'Tắt' : 'Bật'}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingId ? 'Sửa banner' : 'Thêm banner'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="image_url" label="Ảnh (URL hoặc upload)">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Input placeholder="Dán URL ảnh hoặc upload bên dưới" style={{ flex: 1 }} />
              <label style={{ display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || file.size > 4 * 1024 * 1024) {
                      message.warning('Chọn ảnh ≤ 4MB');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const base64 = (reader.result as string)?.split(',')[1];
                      if (!base64) return;
                      try {
                        const apiBase = (import.meta as any).env?.VITE_API_URL || '';
                        const r = await fetch(apiBase + '/api/upload-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            image: base64,
                            contentType: file.type || 'image/jpeg',
                            filename: file.name,
                            folder: 'banners',
                          }),
                        });
                        const data = await r.json();
                        if (data.url) {
                          form.setFieldValue('image_url', data.url);
                          message.success('Đã upload ảnh');
                        } else {
                          const errMsg = data.error || 'Upload thất bại';
                          message.error({ content: errMsg, duration: 8 });
                        }
                      } catch (err) {
                        message.error('Lỗi kết nối API upload');
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <Button type="default" size="small">Upload R2</Button>
              </label>
            </div>
          </Form.Item>
          <Form.Item name="link_url" label="Link khi click">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="html_code" label="HTML (tùy chọn)">
            <Input.TextArea rows={3} placeholder="<div>...</div>" />
          </Form.Item>
          <Form.Item name="position" label="Vị trí">
            <Select
              options={positionOptions}
              mode="tags"
              tokenSeparators={[',']}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn một hoặc nhiều vị trí"
            />
          </Form.Item>
          <Form.Item name="priority" label="Ưu tiên">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="start_date" label="Ngày bắt đầu">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="end_date" label="Ngày kết thúc">
            <DatePicker style={{ width: '100%' }} />
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
