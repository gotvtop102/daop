import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, InputNumber, Space, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';

function createSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function ServerSources() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    const r = await supabase.from('server_sources').select('*').order('sort_order');
    setData(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleActive = async (row: any) => {
    try {
      const { error } = await supabase.from('server_sources').update({ is_active: !row.is_active }).eq('id', row.id);
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Cập nhật thất bại');
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (row: any) => {
    setEditingId(row.id);
    form.setFieldsValue(row);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa?')) return;
    try {
      const { error } = await supabase.from('server_sources').delete().eq('id', id);
      if (error) throw error;
      message.success('Đã xóa');
      await loadData();
    } catch (e: any) {
      message.error(e?.message || 'Xóa thất bại');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const slug = values.slug?.trim() || createSlug(values.name || '');
      const payload = {
        name: (values.name || '').trim(),
        slug,
        sort_order: Number(values.sort_order ?? 0),
        is_active: !!values.is_active,
      };
      if (editingId) {
        const { error } = await supabase.from('server_sources').update(payload).eq('id', editingId);
        if (error) throw error;
        message.success('Đã cập nhật');
      } else {
        const { error } = await supabase.from('server_sources').insert(payload);
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
      <h1>Nguồn server (máy chủ)</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Sau khi lưu, cần chạy Build website để áp dụng danh sách server lên site.
      </p>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm nguồn</Button>
      </div>
      <Table
        loading={loading}
        dataSource={data}
        rowKey="id"
        columns={[
          { title: 'Thứ tự', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
          { title: 'Tên', dataIndex: 'name', key: 'name' },
          { title: 'Slug', dataIndex: 'slug', key: 'slug' },
          { title: 'Trạng thái', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Bật' : 'Tắt'}</Tag> },
          {
            title: '',
            key: 'action',
            width: 150,
            render: (_: any, row: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(row)}>Sửa</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(row.id)}>Xóa</Button>
                <Button size="small" onClick={() => toggleActive(row)}>{row.is_active ? 'Tắt' : 'Bật'}</Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingId ? 'Sửa nguồn server' : 'Thêm nguồn server'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Tên" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Vietsub #1" />
          </Form.Item>
          <Form.Item name="slug" label="Slug" rules={[{ required: true }]}>
            <Input placeholder="Tự động tạo từ tên nếu để trống" />
          </Form.Item>
          <Form.Item name="sort_order" label="Thứ tự" initialValue={0}>
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item name="is_active" label="Bật" valuePropName="checked" initialValue={true}>
            <input type="checkbox" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
