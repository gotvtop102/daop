import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Switch, message, Alert } from 'antd';
import { supabase } from '../lib/supabase';

/** Cùng key với site-settings.json / build — chỉ lưu hành vi popup (không gộp form Banner). */
const AD_OTHER_KEYS = ['ad_popup_enabled', 'ad_popup_delay_ms', 'ad_popup_cooldown_hours'] as const;

export default function AdOtherSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('key, value')
      .in('key', [...AD_OTHER_KEYS])
      .then((r) => {
        if (r.error) {
          message.error(r.error.message || 'Không tải được cài đặt');
          setLoading(false);
          return;
        }
        const data = (r.data ?? []).reduce((acc: Record<string, string>, row: { key: string; value: string | null }) => {
          acc[row.key] = row.value ?? '';
          return acc;
        }, {});
        form.setFieldsValue({
          ad_popup_enabled: data.ad_popup_enabled !== 'false',
          ad_popup_delay_ms: data.ad_popup_delay_ms ?? '3000',
          ad_popup_cooldown_hours: data.ad_popup_cooldown_hours ?? '12',
        });
        setLoading(false);
      });
  }, [form]);

  const onFinish = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      for (const key of AD_OTHER_KEYS) {
        const raw = values[key];
        const value =
          raw === true || raw === false ? String(raw) : String(raw ?? '');
        const { error } = await supabase.from('site_settings').upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        if (error) throw error;
      }
      message.success('Đã lưu. Chạy Build website để áp dụng lên site tĩnh.');
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 style={{ marginTop: 0, fontSize: '1.15rem', fontWeight: 600 }}>Quảng cáo khác</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Cấu hình hành vi popup (bật/tắt, độ trễ, tần suất). Ảnh hoặc mã HTML hiển thị vẫn tạo ở tab{' '}
        <strong>Banner</strong> với vị trí <code>popup</code> — tách biệt bảng banner, chỉ điều khiển logic tại đây.
      </p>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Vị trí dải menu, thanh neo, góc nổi"
        description={
          <span>
            Thêm nội dung quảng cáo ở tab <strong>Banner</strong> với các vị trí <code>header_strip</code>,{' '}
            <code>sticky_bottom</code>, <code>floating_corner</code> — không cần cấu hình thêm ở trang này.
          </span>
        }
      />
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="ad_popup_enabled" label="Bật popup quảng cáo" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="ad_popup_delay_ms" label="Độ trễ trước khi hiện popup (mili giây)">
            <Input type="number" min={0} max={120000} placeholder="3000" />
          </Form.Item>
          <p style={{ color: '#888', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
            Ví dụ 3000 = 3 giây sau khi vào trang.
          </p>
          <Form.Item name="ad_popup_cooldown_hours" label="Không hiện lại popup trong (giờ) sau khi đóng">
            <Input type="number" min={1} max={168} placeholder="12" />
          </Form.Item>
          <p style={{ color: '#888', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
            Lưu trên trình duyệt người xem.
          </p>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} disabled={loading}>
              Lưu
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
