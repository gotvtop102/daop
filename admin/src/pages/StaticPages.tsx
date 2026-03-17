import { useEffect, useRef, useState } from 'react';
import { Card, Form, Input, Button, Tabs, message } from 'antd';
import { supabase } from '../lib/supabase';

type RichTextEditorProps = {
  value?: string;
  onChange?: (val: string) => void;
};

function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current && typeof value === 'string' && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (!onChange || !ref.current) return;
    onChange(ref.current.innerHTML);
  };

  return (
    <div>
      <div
        ref={ref}
        contentEditable
        onInput={handleInput}
        style={{
          minHeight: 180,
          padding: 8,
          borderRadius: 4,
          border: '1px solid #d9d9d9',
          background: '#ffffff',
          overflowY: 'auto',
        }}
      />
      <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
        Soạn nội dung trực tiếp (hỗ trợ định dạng cơ bản qua trình duyệt).
      </div>
    </div>
  );
}

export default function StaticPages() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('static_pages').select('*').then((r) => {
      const pages = r.data ?? [];
      const find = (key: string) => pages.find((p: any) => p.page_key === key);
      form.setFieldsValue({
        about_content: find('about')?.content ?? '',
        app_guide_content: find('app_guide')?.content ?? '',
        apk_link: (find('app_guide') as any)?.apk_link ?? '',
        testflight_link: (find('app_guide') as any)?.testflight_link ?? '',
        contact_content: find('contact')?.content ?? '',
        faq_content: find('faq')?.content ?? '',
        privacy_content: find('privacy')?.content ?? '',
        terms_content: find('terms')?.content ?? '',
      });
      setLoading(false);
    });
  }, [form]);

  const onFinish = async (values: any) => {
    try {
      const rows = [
        { page_key: 'about', content: values.about_content, updated_at: new Date().toISOString() },
        { page_key: 'app_guide', content: values.app_guide_content, apk_link: values.apk_link ?? null, testflight_link: values.testflight_link ?? null, updated_at: new Date().toISOString() },
        { page_key: 'contact', content: values.contact_content, updated_at: new Date().toISOString() },
        { page_key: 'faq', content: values.faq_content, updated_at: new Date().toISOString() },
        { page_key: 'privacy', content: values.privacy_content, updated_at: new Date().toISOString() },
        { page_key: 'terms', content: values.terms_content, updated_at: new Date().toISOString() },
      ];
      const { error } = await supabase.from('static_pages').upsert(rows, { onConflict: 'page_key' });
      if (error) throw error;
      message.success('Đã lưu trang tĩnh');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  return (
    <>
      <h1>Nội dung tĩnh</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Sau khi lưu, cần chạy Build website để xuất nội dung ra site.
      </p>
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Tabs
            items={[
              { key: 'about', label: 'Giới thiệu', children: <Form.Item name="about_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item> },
              { key: 'contact', label: 'Liên hệ', children: <Form.Item name="contact_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item> },
              { key: 'faq', label: 'Hỏi-đáp', children: <Form.Item name="faq_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item> },
              { key: 'privacy', label: 'Chính sách bảo mật', children: <Form.Item name="privacy_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item> },
              { key: 'terms', label: 'Điều khoản sử dụng', children: <Form.Item name="terms_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item> },
              {
                key: 'app_guide',
                label: 'Hướng dẫn app',
                children: (
                  <>
                    <Form.Item name="app_guide_content" label="Nội dung"><RichTextEditor /></Form.Item>
                    <Form.Item name="apk_link" label="Link APK"><Input placeholder="https://..." /></Form.Item>
                    <Form.Item name="testflight_link" label="Link TestFlight"><Input placeholder="https://..." /></Form.Item>
                  </>
                ),
              },
            ]}
          />
          <Form.Item>
            <Button type="primary" htmlType="submit">Lưu</Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
