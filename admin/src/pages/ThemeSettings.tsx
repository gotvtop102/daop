import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Tabs } from 'antd';
import { supabase } from '../lib/supabase';

const THEME_KEYS = [
  'theme_primary', 'theme_bg', 'theme_card', 'theme_border', 'theme_accent',
  'theme_text', 'theme_muted',
  'theme_primary_light', 'theme_accent_light',
  'theme_light_bg', 'theme_light_card', 'theme_light_border', 'theme_light_text', 'theme_light_muted', 'theme_light_surface',
  'theme_header_logo', 'theme_header_link',
  'theme_footer_text', 'theme_section_title', 'theme_filter_label',
  'theme_pagination', 'theme_link',
  'theme_slider_title', 'theme_slider_meta', 'theme_slider_desc',
  'theme_movie_card_title', 'theme_movie_card_meta',
  'theme_header_logo_light', 'theme_header_link_light',
  'theme_footer_text_light', 'theme_section_title_light', 'theme_filter_label_light',
  'theme_pagination_light', 'theme_link_light',
  'theme_slider_title_light', 'theme_slider_meta_light', 'theme_slider_desc_light',
  'theme_movie_card_title_light', 'theme_movie_card_meta_light',
] as const;

const DEFAULTS: Record<string, string> = {
  theme_primary: '#58a6ff',
  theme_bg: '#0d1117',
  theme_card: '#161b22',
  theme_border: '#30363d',
  theme_accent: '#58a6ff',
  theme_text: '#e6edf3',
  theme_muted: '#8b949e',
  theme_primary_light: '#2563eb',
  theme_accent_light: '#1d4ed8',
  theme_light_bg: '#fcf7f0',
  theme_light_card: '#fffdf9',
  theme_light_border: '#e8dfd3',
  theme_light_text: '#1f2328',
  theme_light_muted: '#5b6672',
  theme_light_surface: 'rgba(245, 158, 11, 0.10)',
  theme_header_logo: '#e6edf3',
  theme_header_link: '#e6edf3',
  theme_footer_text: '#8b949e',
  theme_section_title: '#e6edf3',
  theme_filter_label: '#8b949e',
  theme_pagination: '#e6edf3',
  theme_link: '#58a6ff',
  theme_link_light: '#2563eb',
  theme_slider_title: '#ffffff',
  theme_slider_meta: 'rgba(255,255,255,0.75)',
  theme_slider_desc: 'rgba(255,255,255,0.7)',
  theme_movie_card_title: '#f85149',
  theme_movie_card_meta: '#8b949e',
  theme_header_logo_light: '#1f2328',
  theme_header_link_light: '#1f2328',
  theme_footer_text_light: '#5c6773',
  theme_section_title_light: '#1f2328',
  theme_filter_label_light: '#5c6773',
  theme_pagination_light: '#1f2328',
  theme_slider_title_light: '#ffffff',
  theme_slider_meta_light: 'rgba(255,255,255,0.75)',
  theme_slider_desc_light: 'rgba(255,255,255,0.7)',
  theme_movie_card_title_light: '#1f2328',
  theme_movie_card_meta_light: '#5c6773',
};

const LABELS: Record<string, string> = {
  theme_primary: 'Màu chủ đạo (nút)',
  theme_bg: 'Màu nền trang',
  theme_card: 'Màu thẻ / header',
  theme_border: 'Màu viền (border)',
  theme_accent: 'Màu nhấn (hover)',
  theme_text: 'Chữ chính (body)',
  theme_muted: 'Chữ phụ (mờ, nhạt)',
  theme_primary_light: 'Màu chủ đạo (nút) - Light theme',
  theme_accent_light: 'Màu nhấn (hover) - Light theme',
  theme_light_bg: 'Light theme: nền trang',
  theme_light_card: 'Light theme: thẻ / header',
  theme_light_border: 'Light theme: viền (border)',
  theme_light_text: 'Light theme: chữ chính',
  theme_light_muted: 'Light theme: chữ phụ (muted)',
  theme_light_surface: 'Light theme: nền ô nổi (surface)',
  theme_header_logo: 'Header: màu logo/tên site',
  theme_header_link: 'Header: màu link menu',
  theme_footer_text: 'Footer: màu chữ',
  theme_section_title: 'Section: màu tiêu đề block (VD Phim bộ, Phim lẻ)',
  theme_filter_label: 'Bộ lọc: màu nhãn (năm, thể loại...)',
  theme_pagination: 'Phân trang: màu chữ',
  theme_link: 'Link (trong nội dung)',
  theme_link_light: 'Link (trong nội dung) - Light theme',
  theme_slider_title: 'Slider trang chủ: tiêu đề',
  theme_slider_meta: 'Slider: dòng 2 (năm | quốc gia)',
  theme_slider_desc: 'Slider: mô tả',
  theme_movie_card_title: 'Thẻ phim: tiêu đề',
  theme_movie_card_meta: 'Thẻ phim: dòng phụ (năm, tập)',
  theme_header_logo_light: 'Header - Light theme: màu logo/tên site',
  theme_header_link_light: 'Header - Light theme: màu link menu',
  theme_footer_text_light: 'Footer - Light theme: màu chữ',
  theme_section_title_light: 'Section - Light theme: màu tiêu đề block',
  theme_filter_label_light: 'Bộ lọc - Light theme: màu nhãn (năm, thể loại...)',
  theme_pagination_light: 'Phân trang - Light theme: màu chữ',
  theme_slider_title_light: 'Slider - Light theme: tiêu đề',
  theme_slider_meta_light: 'Slider - Light theme: dòng 2 (năm | quốc gia)',
  theme_slider_desc_light: 'Slider - Light theme: mô tả',
  theme_movie_card_title_light: 'Thẻ phim - Light theme: tiêu đề',
  theme_movie_card_meta_light: 'Thẻ phim - Light theme: dòng phụ (năm, tập)',
};

function normalizePickerHex(v: string) {
  if (!v) return '#000000';
  var s = String(v).trim();
  if (s.startsWith('#') && (s.length === 4 || s.length === 7)) return s;
  return '#000000';
}

function ColorValueInput({ value, onChange, placeholder, defaultValue }: { value?: string; onChange?: (v: string) => void; placeholder?: string; defaultValue?: string }) {
  const raw = String(value || '');
  const picker = normalizePickerHex(raw);
  return (
    <Input.Group compact>
      <input
        type="color"
        value={picker}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{ width: 56, height: 32, padding: 0, border: 'none', background: 'transparent' }}
      />
      <Input
        value={raw}
        placeholder={placeholder || 'vd: #58a6ff hoặc rgba(255,255,255,0.7)'}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{ width: 320 }}
      />
      <Button
        onClick={() => onChange && onChange(String(defaultValue || ''))}
        style={{ height: 32 }}
      >
        Mặc định
      </Button>
    </Input.Group>
  );
}

export default function ThemeSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  const toHex = (v: string) => {
    if (!v) return '';
    if (v.startsWith('rgba') || v.startsWith('rgb(')) return v;
    return v.startsWith('#') ? v : '#' + v;
  };

  useEffect(() => {
    supabase.from('site_settings').select('key, value').in('key', [...THEME_KEYS]).then((r) => {
      const data = (r.data ?? []).reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value ?? '';
        return acc;
      }, {});
      const fields: Record<string, string> = {};
      THEME_KEYS.forEach((key) => {
        fields[key] = toHex(data[key]) || DEFAULTS[key] || '';
      });
      form.setFieldsValue(fields);
      setLoading(false);
    });
  }, [form]);

  const onFinish = async (values: Record<string, string>) => {
    try {
      for (const key of THEME_KEYS) {
        const { error } = await supabase.from('site_settings').upsert(
          { key, value: values[key] || DEFAULTS[key] || '', updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        if (error) throw error;
      }
      message.success('Đã lưu theme. Chạy Build website để áp dụng lên site.');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  return (
    <>
      <h1>Theme (màu sắc)</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Màu nền, màu chữ và màu từng loại chữ trên website. Sau khi lưu, cần chạy Build website để xuất ra site.
      </p>
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Tabs
            defaultActiveKey="dark"
            items={[
              {
                key: 'dark',
                label: 'Nền tối (Dark)',
                children: (
                  <>
                    <h3 style={{ marginTop: 0, marginBottom: 12 }}>Màu nền &amp; chung</h3>
                    <Form.Item name="theme_primary" label={LABELS.theme_primary}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_primary} />
                    </Form.Item>
                    <Form.Item name="theme_bg" label={LABELS.theme_bg}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_bg} />
                    </Form.Item>
                    <Form.Item name="theme_card" label={LABELS.theme_card}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_card} />
                    </Form.Item>
                    <Form.Item name="theme_border" label={LABELS.theme_border}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_border} />
                    </Form.Item>
                    <Form.Item name="theme_text" label={LABELS.theme_text}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_text} />
                    </Form.Item>
                    <Form.Item name="theme_muted" label={LABELS.theme_muted}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_muted} />
                    </Form.Item>
                    <Form.Item name="theme_accent" label={LABELS.theme_accent}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_accent} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Link</h3>
                    <Form.Item name="theme_link" label={LABELS.theme_link}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_link} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Header (menu)</h3>
                    <Form.Item name="theme_header_logo" label={LABELS.theme_header_logo}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_header_logo} />
                    </Form.Item>
                    <Form.Item name="theme_header_link" label={LABELS.theme_header_link}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_header_link} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Footer</h3>
                    <Form.Item name="theme_footer_text" label={LABELS.theme_footer_text}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_footer_text} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Section &amp; Bộ lọc &amp; Phân trang</h3>
                    <Form.Item name="theme_section_title" label={LABELS.theme_section_title}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_section_title} />
                    </Form.Item>
                    <Form.Item name="theme_filter_label" label={LABELS.theme_filter_label}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_filter_label} />
                    </Form.Item>
                    <Form.Item name="theme_pagination" label={LABELS.theme_pagination}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_pagination} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Slider trang chủ</h3>
                    <Form.Item name="theme_slider_title" label={LABELS.theme_slider_title}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_slider_title} />
                    </Form.Item>
                    <Form.Item name="theme_slider_meta" label={LABELS.theme_slider_meta}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_slider_meta} placeholder="vd: rgba(255,255,255,0.75) hoặc #ccc" />
                    </Form.Item>
                    <Form.Item name="theme_slider_desc" label={LABELS.theme_slider_desc}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_slider_desc} placeholder="vd: rgba(255,255,255,0.7) hoặc #aaa" />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Thẻ phim (danh sách)</h3>
                    <Form.Item name="theme_movie_card_title" label={LABELS.theme_movie_card_title}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_movie_card_title} />
                    </Form.Item>
                    <Form.Item name="theme_movie_card_meta" label={LABELS.theme_movie_card_meta}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_movie_card_meta} />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'light',
                label: 'Nền sáng (Light)',
                children: (
                  <>
                    <h3 style={{ marginTop: 0, marginBottom: 12 }}>Màu nền &amp; chung</h3>
                    <Form.Item name="theme_primary_light" label={LABELS.theme_primary_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_primary_light} />
                    </Form.Item>
                    <Form.Item name="theme_light_bg" label={LABELS.theme_light_bg}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_light_bg} />
                    </Form.Item>
                    <Form.Item name="theme_light_card" label={LABELS.theme_light_card}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_light_card} />
                    </Form.Item>
                    <Form.Item name="theme_light_border" label={LABELS.theme_light_border}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_light_border} />
                    </Form.Item>
                    <Form.Item name="theme_light_text" label={LABELS.theme_light_text}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_light_text} />
                    </Form.Item>
                    <Form.Item name="theme_light_muted" label={LABELS.theme_light_muted}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_light_muted} />
                    </Form.Item>
                    <Form.Item name="theme_accent_light" label={LABELS.theme_accent_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_accent_light} />
                    </Form.Item>
                    <Form.Item name="theme_light_surface" label={LABELS.theme_light_surface}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_light_surface} placeholder="vd: rgba(9,105,218,0.12) hoặc #dbeafe" />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Link</h3>
                    <Form.Item name="theme_link_light" label={LABELS.theme_link_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_link_light} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Header (menu)</h3>
                    <Form.Item name="theme_header_logo_light" label={LABELS.theme_header_logo_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_header_logo_light} />
                    </Form.Item>
                    <Form.Item name="theme_header_link_light" label={LABELS.theme_header_link_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_header_link_light} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Footer</h3>
                    <Form.Item name="theme_footer_text_light" label={LABELS.theme_footer_text_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_footer_text_light} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Section &amp; Bộ lọc &amp; Phân trang</h3>
                    <Form.Item name="theme_section_title_light" label={LABELS.theme_section_title_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_section_title_light} />
                    </Form.Item>
                    <Form.Item name="theme_filter_label_light" label={LABELS.theme_filter_label_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_filter_label_light} />
                    </Form.Item>
                    <Form.Item name="theme_pagination_light" label={LABELS.theme_pagination_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_pagination_light} />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Slider trang chủ</h3>
                    <Form.Item name="theme_slider_title_light" label={LABELS.theme_slider_title_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_slider_title_light} />
                    </Form.Item>
                    <Form.Item name="theme_slider_meta_light" label={LABELS.theme_slider_meta_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_slider_meta_light} placeholder="vd: rgba(0,0,0,0.75) hoặc #57606a" />
                    </Form.Item>
                    <Form.Item name="theme_slider_desc_light" label={LABELS.theme_slider_desc_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_slider_desc_light} placeholder="vd: rgba(0,0,0,0.7) hoặc #57606a" />
                    </Form.Item>

                    <h3 style={{ marginTop: 24, marginBottom: 12 }}>Thẻ phim (danh sách)</h3>
                    <Form.Item name="theme_movie_card_title_light" label={LABELS.theme_movie_card_title_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_movie_card_title_light} />
                    </Form.Item>
                    <Form.Item name="theme_movie_card_meta_light" label={LABELS.theme_movie_card_meta_light}>
                      <ColorValueInput defaultValue={DEFAULTS.theme_movie_card_meta_light} />
                    </Form.Item>
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
