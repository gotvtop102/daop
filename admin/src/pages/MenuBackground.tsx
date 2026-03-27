import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Image } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';

const MENU_ITEMS = [
  { key: 'menu_bg_1', label: '1. Phim bộ' },
  { key: 'menu_bg_2', label: '2. Phim lẻ' },
  { key: 'menu_bg_3', label: '3. Thể loại' },
  { key: 'menu_bg_4', label: '4. Quốc gia' },
  { key: 'menu_bg_5', label: '5. Chủ đề' },
  { key: 'menu_bg_6', label: '6. Diễn viên' },
  { key: 'menu_bg_7', label: '7. Hoạt hình' },
  { key: 'menu_bg_8', label: '8. TV Shows' },
  { key: 'menu_bg_9', label: '9. Giới thiệu' },
  { key: 'menu_bg_10', label: '10. Donate' },
  { key: 'menu_bg_11', label: '11. Tải app' },
  { key: 'menu_bg_12', label: '12. Liên hệ' },
];

export default function MenuBackground() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const watched = Form.useWatch(MENU_ITEMS.map((i) => i.key), form);
  const urls: Record<string, string> = MENU_ITEMS.reduce((acc, item, i) => {
    acc[item.key] =
      (Array.isArray(watched) ? watched[i] : (watched as Record<string, string>)?.[item.key]) ??
      form.getFieldValue(item.key) ??
      '';
    return acc;
  }, {} as Record<string, string>);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('site_settings').select('key, value');
    const obj = (data ?? []).reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
      acc[row.key] = row.value ?? '';
      return acc;
    }, {});
    const fields: Record<string, string> = {};
    MENU_ITEMS.forEach(({ key }) => {
      fields[key] = obj[key] ?? '';
    });
    form.setFieldsValue(fields);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onFinish = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(values)) {
        if (MENU_ITEMS.some((i) => i.key === key)) {
          const { error } = await supabase
            .from('site_settings')
            .upsert(
              { key, value: value ?? '', updated_at: new Date().toISOString() },
              { onConflict: 'key' }
            );
          if (error) throw error;
        }
      }
      message.success('Đã lưu 12 ảnh nền menu');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (key: string, file: File) => {
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
            contentType: file.type || 'image/png',
            filename: file.name,
            folder: 'menu-background',
          }),
        });
        const data = await r.json();
        if (data.url) {
          form.setFieldValue(key, data.url);
          message.success('Đã upload ảnh');
        } else {
          const errMsg = data.error || 'Upload thất bại';
          message.error({ content: errMsg, duration: 8 });
        }
      } catch {
        message.error('Lỗi kết nối API upload');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <h1>Ảnh nền menu mobile (12 mục)</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Sau khi lưu, cần chạy Build website để áp dụng lên site.
      </p>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Mỗi mục trong menu 3 gạch trên mobile có một ảnh nền riêng. Upload ảnh hoặc nhập link.
        Để tối ưu cho background: dùng ảnh đã xóa nền (PNG) hoặc công cụ như{' '}
        <a href="https://www.remove.bg" target="_blank" rel="noopener noreferrer">
          remove.bg
        </a>{' '}
        rồi dán link ảnh đã xóa nền vào đây.
      </p>
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {MENU_ITEMS.map(({ key, label }) => (
            <Form.Item key={key} name={key} label={label}>
              <Input placeholder="https://... (link ảnh hoặc ảnh đã xóa nền)" allowClear />
            </Form.Item>
          ))}
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#666' }}>Upload ảnh cho từng ô: chọn file rồi chọn số thứ tự (1–12 để gán:</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              id="menu-bg-upload"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const idx = prompt('Gán vào ô số (1–12)?', '1');
                const n = idx ? parseInt(idx, 10) : NaN;
                if (n >= 1 && n <= 12) {
                  const key = `menu_bg_${n}`;
                  await handleUpload(key, file);
                }
                e.target.value = '';
              }}
            />
            <Button
              type="default"
              icon={<UploadOutlined />}
              onClick={() => document.getElementById('menu-bg-upload')?.click()}
            >
              Chọn file → gán ô
            </Button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {MENU_ITEMS.map(({ key, label }) => {
              const url = urls[key] ?? '';
              return url ? (
                <div key={key} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
                  <Image src={url} width={64} height={64} style={{ objectFit: 'cover', borderRadius: 6 }} alt="" />
                </div>
              ) : null;
            })}
          </div>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              Lưu tất cả
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
