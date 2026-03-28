import { useEffect, useState, useRef } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/api';

type PrerollRow = {
  id: string;
  name: string | null;
  video_url: string | null;
  image_url: string | null;
  duration: number | null;
  skip_after: number | null;
  weight: number | null;
  is_active: boolean;
  roll?: 'pre' | 'mid' | 'post' | null;
};

export default function PrerollAds() {
  const [data, setData] = useState<PrerollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rollFilter, setRollFilter] = useState<'all' | 'pre' | 'mid' | 'post'>('all');
  const [form] = Form.useForm();
  const prerollImageInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    const r = await supabase.from('ad_preroll').select('*').order('weight', { ascending: false });
    setData((r.data as PrerollRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true, weight: 0, roll: 'pre' });
    setModalVisible(true);
  };

  const openEdit = (row: PrerollRow) => {
    setEditingId(row.id);
    form.setFieldsValue(row);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa quảng cáo này?')) return;
    try {
      const { error } = await supabase.from('ad_preroll').delete().eq('id', id);
      if (error) throw error;
      message.success('Đã xóa');
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Xóa thất bại');
    }
  };

  const toggleActive = async (row: PrerollRow) => {
    try {
      const { error } = await supabase.from('ad_preroll').update({ is_active: !row.is_active }).eq('id', row.id);
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Cập nhật thất bại');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        name: values.name || null,
        video_url: values.video_url || null,
        image_url: values.image_url || null,
        duration: values.duration != null ? Number(values.duration) : null,
        skip_after: values.skip_after != null ? Number(values.skip_after) : null,
        weight: values.weight != null ? Number(values.weight) : 0,
        is_active: !!values.is_active,
        roll: values.roll || 'pre',
      };
      if (editingId) {
        const { error } = await supabase.from('ad_preroll').update(payload).eq('id', editingId);
        if (error) throw error;
        message.success('Đã cập nhật');
      } else {
        const { error } = await supabase.from('ad_preroll').insert(payload);
        if (error) throw error;
        message.success('Đã thêm');
      }
      setModalVisible(false);
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  return (
    <>
      <h1>Quảng cáo Video (Pre/Mid/Post-roll)</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Sau khi lưu, cần chạy Build website để áp dụng lên player.
      </p>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Thêm quảng cáo
          </Button>
          <Select
            value={rollFilter}
            style={{ width: 200 }}
            onChange={(v) => setRollFilter(v)}
            options={[
              { value: 'all', label: 'Tất cả vị trí' },
              { value: 'pre', label: 'Pre-roll' },
              { value: 'mid', label: 'Mid-roll' },
              { value: 'post', label: 'Post-roll' },
            ]}
          />
        </Space>
      </div>
      <Table
        loading={loading}
        dataSource={data.filter((row) => {
          if (rollFilter === 'all') return true;
          const r = (row.roll || 'pre') as any;
          return r === rollFilter;
        })}
        rowKey="id"
        columns={[
          {
            title: 'Vị trí',
            dataIndex: 'roll',
            key: 'roll',
            width: 110,
            render: (v: any) => {
              const roll = (v || 'pre') as 'pre' | 'mid' | 'post';
              const label = roll === 'mid' ? 'Mid' : roll === 'post' ? 'Post' : 'Pre';
              const color = roll === 'mid' ? 'blue' : roll === 'post' ? 'gold' : 'green';
              return <Tag color={color}>{label}</Tag>;
            },
          },
          { title: 'Tên', dataIndex: 'name', key: 'name' },
          { title: 'Video URL', dataIndex: 'video_url', key: 'video_url', ellipsis: true },
          { title: 'Thời lượng (s)', dataIndex: 'duration', key: 'duration', width: 100 },
          { title: 'Bỏ qua sau (s)', dataIndex: 'skip_after', key: 'skip_after', width: 110 },
          { title: 'Trọng số', dataIndex: 'weight', key: 'weight', width: 90 },
          {
            title: 'Trạng thái',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Bật' : 'Tắt'}</Tag>,
          },
          {
            title: '',
            key: 'action',
            width: 180,
            render: (_: any, row: PrerollRow) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Sửa</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(row.id)}>Xóa</Button>
                <Button size="small" onClick={() => toggleActive(row)}>{row.is_active ? 'Tắt' : 'Bật'}</Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingId ? 'Sửa pre-roll' : 'Thêm pre-roll'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="roll" label="Vị trí" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'pre', label: 'Pre-roll' },
                { value: 'mid', label: 'Mid-roll' },
                { value: 'post', label: 'Post-roll' },
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="Tên">
            <Input placeholder="Mô tả ngắn" />
          </Form.Item>
          <Form.Item name="video_url" label="URL video" rules={[{ required: true }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="image_url" label="URL ảnh (poster/thumbnail)">
            <Input
              placeholder="https://... hoặc bấm nút bên cạnh"
              addonAfter={
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <input
                    ref={prerollImageInputRef}
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
                          const r = await fetch(`${getApiBaseUrl()}/api/upload-image`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              image: base64,
                              contentType: file.type || 'image/jpeg',
                              filename: file.name,
                              folder: 'preroll',
                            }),
                          });
                          const data = await r.json();
                          if (data.url) {
                            form.setFieldValue('image_url', data.url);
                            message.success('Đã upload ảnh');
                          } else {
                            message.error(data.error || 'Upload thất bại');
                          }
                        } catch {
                          message.error('Lỗi kết nối API upload');
                        }
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                  <Button type="link" size="small" onClick={() => prerollImageInputRef.current?.click()}>
                    Chọn ảnh / Tải lên
                  </Button>
                </span>
              }
            />
          </Form.Item>
          <Form.Item name="duration" label="Thời lượng (giây)">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="skip_after" label="Cho phép bỏ qua sau (giây)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="weight" label="Trọng số (cao = ưu tiên)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label="Bật" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
