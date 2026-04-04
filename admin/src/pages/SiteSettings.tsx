import { useEffect, useState, useRef } from 'react';
import { Card, Form, Input, Button, Switch, Tabs, message, Select } from 'antd';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/api';

/** Footer HTML mặc định (banner + logo + 3 link + copyright). Logo dùng ảnh từ Logo URL ở trên. */
const DEFAULT_FOOTER_HTML = `<div class="footer-vietnam-wrap">
  <div class="footer-vietnam-banner">
    <span class="footer-flag" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid meet"><rect width="30" height="20" fill="#DA251D"/><path fill="#FFFF00" d="M15 4l2.47 7.6H25l-6.23 4.5 2.36 7.3L15 16.2l-6.13 4.2 2.36-7.3L5 11.6h7.53z"/></svg></span> Trường Sa &amp; Hoàng Sa là của Việt Nam!
  </div>
</div>
<div class="footer-bottom">
  <div class="footer-bottom-inner">
    <a href="/" class="footer-logo">GoTV<span class="footer-logo-text">GoTV - Trang tổng hợp phim, video, chương trình, tư liệu giải trí đỉnh cao.</span></a>
    <span class="footer-divider" aria-hidden="true"></span>
    <div class="footer-links-col">
      <a href="/hoi-dap.html">Hỏi - đáp</a>
      <a href="/chinh-sach-bao-mat.html">Chính sách bảo mật</a>
      <a href="/dieu-khoan-su-dung.html">Điều khoản sử dụng</a>
    </div>
  </div>
</div>
<p class="footer-copyright">Copyright 2018 <a href="https://gotv.top" target="_blank" rel="noopener">GoTV</a>. All rights reserved.</p>`;

const SITE_SETTINGS_KEYS = [
  'site_name',
  'site_url',
  'logo_url',
  'favicon_url',
  'r2_img_domain',
  'ophim_img_domain',
  'home_prebuild_enabled',
  'home_prebuild_limit',
  'home_prebuild_enable_series',
  'home_prebuild_enable_single',
  'home_prebuild_enable_hoathinh',
  'home_prebuild_enable_tvshows',
  'home_prebuild_enable_year',
  'home_prebuild_years',
  'home_prebuild_enable_genre',
  'home_prebuild_genres',
  'home_prebuild_enable_country',
  'home_prebuild_countries',
  'home_prebuild_enable_quality_4k',
  'home_prebuild_enable_status_current',
  'home_prebuild_enable_status_upcoming',
  'home_prebuild_enable_status_theater',
  'home_prebuild_enable_exclusive',
  'home_prebuild_enable_vietsub',
  'home_prebuild_enable_thuyetminh',
  'home_prebuild_enable_longtieng',
  'google_analytics_id',
  'simple_analytics_script',
  'supabase_user_url',
  'supabase_user_anon_key',
  'player_visible',
  'detail_hide_header_default',
  'watch_hide_header_default',
  'movie_detail_similar_limit',
  'social_facebook',
  'social_twitter',
  'social_instagram',
  'social_youtube',
  'footer_content',
  'tmdb_attribution',
  'loading_screen_enabled',
  'loading_screen_min_seconds',
] as const;

export default function SiteSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('site_settings').select('key, value').then((r) => {
      if (r.error) {
        message.error(r.error.message || 'Không tải được cài đặt từ Supabase');
        setLoading(false);
        return;
      }
      const data = (r.data ?? []).reduce((acc: Record<string, any>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      form.setFieldsValue({
        site_name: data.site_name ?? 'DAOP Phim',
        site_url: data.site_url ?? '',
        logo_url: data.logo_url ?? '',
        favicon_url: data.favicon_url ?? '',
        r2_img_domain: data.r2_img_domain ?? '',
        ophim_img_domain: data.ophim_img_domain ?? 'https://img.ophim.live',
        home_prebuild_enabled: data.home_prebuild_enabled !== 'false',
        home_prebuild_limit: data.home_prebuild_limit ?? '24',
        home_prebuild_enable_series: data.home_prebuild_enable_series !== 'false',
        home_prebuild_enable_single: data.home_prebuild_enable_single !== 'false',
        home_prebuild_enable_hoathinh: data.home_prebuild_enable_hoathinh !== 'false',
        home_prebuild_enable_tvshows: data.home_prebuild_enable_tvshows !== 'false',
        home_prebuild_enable_year: data.home_prebuild_enable_year !== 'false',
        home_prebuild_years: data.home_prebuild_years ?? '',
        home_prebuild_enable_genre: data.home_prebuild_enable_genre !== 'false',
        home_prebuild_genres: data.home_prebuild_genres ?? '',
        home_prebuild_enable_country: data.home_prebuild_enable_country !== 'false',
        home_prebuild_countries: data.home_prebuild_countries ?? '',
        home_prebuild_enable_quality_4k: data.home_prebuild_enable_quality_4k !== 'false',
        home_prebuild_enable_status_current: data.home_prebuild_enable_status_current !== 'false',
        home_prebuild_enable_status_upcoming: data.home_prebuild_enable_status_upcoming !== 'false',
        home_prebuild_enable_status_theater: data.home_prebuild_enable_status_theater !== 'false',
        home_prebuild_enable_exclusive: data.home_prebuild_enable_exclusive !== 'false',
        home_prebuild_enable_vietsub: data.home_prebuild_enable_vietsub !== 'false',
        home_prebuild_enable_thuyetminh: data.home_prebuild_enable_thuyetminh !== 'false',
        home_prebuild_enable_longtieng: data.home_prebuild_enable_longtieng !== 'false',
        google_analytics_id: data.google_analytics_id ?? '',
        simple_analytics_script: data.simple_analytics_script ?? '',
        supabase_user_url: data.supabase_user_url ?? '',
        supabase_user_anon_key: data.supabase_user_anon_key ?? '',
        player_visible: data.player_visible !== 'false',
        detail_hide_header_default: data.detail_hide_header_default === 'true',
        watch_hide_header_default: data.watch_hide_header_default === 'true',
        movie_detail_similar_limit: data.movie_detail_similar_limit ?? '16',
        social_facebook: data.social_facebook ?? '',
        social_twitter: data.social_twitter ?? '',
        social_instagram: data.social_instagram ?? '',
        social_youtube: data.social_youtube ?? '',
        footer_content: data.footer_content ?? '',
        tmdb_attribution: data.tmdb_attribution !== 'false',
        loading_screen_enabled: data.loading_screen_enabled !== 'false',
        loading_screen_min_seconds: data.loading_screen_min_seconds ?? '0',
      });
      setLoading(false);
    });
  }, [form]);

  const onFinish = async (values: Record<string, any>) => {
    setSaving(true);
    try {
      const toSave: Record<string, string> = {};
      for (const key of SITE_SETTINGS_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
        const raw = values[key];
        toSave[key] = raw === true || raw === false ? String(raw) : (raw ?? '');
      }
      for (const [key, value] of Object.entries(toSave)) {
        const { error } = await supabase
          .from('site_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
      }
      message.success('Đã lưu cài đặt');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1>Cài đặt chung</h1>
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Tabs
            items={[
              {
                key: 'basic',
                label: 'Cơ bản',
                children: (
                  <>
                    <Form.Item name="site_name" label="Tên website">
                      <Input />
                    </Form.Item>
                    <Form.Item name="site_url" label="Site URL (website chính)">
                      <Input placeholder="https://your-site.com" />
                    </Form.Item>
                    <Form.Item name="logo_url" label="Logo (URL ảnh)">
                      <Input
                        placeholder="https://... hoặc bấm nút bên cạnh để tải ảnh"
                        addonAfter={
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <input
                              ref={logoInputRef}
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
                                        folder: 'site/logo',
                                      }),
                                    });
                                    const data = await r.json();
                                    if (data.url) {
                                      form.setFieldValue('logo_url', data.url);
                                      message.success('Đã upload ảnh logo');
                                    } else {
                                      message.error(data.error || 'Upload thất bại');
                                    }
                                  } catch {
                                    message.error('Lỗi kết nối API upload. Cần deploy Admin lên Vercel và cấu hình GITHUB_* + IMAGE_CDN_BASE.');
                                  }
                                };
                                reader.readAsDataURL(file);
                                e.target.value = '';
                              }}
                            />
                            <Button type="link" size="small" onClick={() => logoInputRef.current?.click()}>
                              Chọn ảnh / Tải lên
                            </Button>
                          </span>
                        }
                      />
                    </Form.Item>
                    <Form.Item name="favicon_url" label="Favicon (URL ảnh)">
                      <Input
                        placeholder="https://... hoặc bấm nút bên cạnh để tải ảnh"
                        addonAfter={
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <input
                              ref={faviconInputRef}
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
                                        contentType: file.type || 'image/png',
                                        filename: file.name,
                                        folder: 'site/favicon',
                                      }),
                                    });
                                    const data = await r.json();
                                    if (data.url) {
                                      form.setFieldValue('favicon_url', data.url);
                                      message.success('Đã upload ảnh favicon');
                                    } else {
                                      message.error(data.error || 'Upload thất bại');
                                    }
                                  } catch {
                                    message.error('Lỗi kết nối API upload. Cần deploy Admin lên Vercel và cấu hình GITHUB_* + IMAGE_CDN_BASE.');
                                  }
                                };
                                reader.readAsDataURL(file);
                                e.target.value = '';
                              }}
                            />
                            <Button type="link" size="small" onClick={() => faviconInputRef.current?.click()}>
                              Chọn ảnh / Tải lên
                            </Button>
                          </span>
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      name="r2_img_domain"
                      label="Base URL ảnh (jsDelivr …/public)"
                      extra="Ảnh phim trong repo: public/thumbs/{id phim}.webp và public/posters/{id phim}.webp (đặt tên theo id, không theo slug)."
                    >
                      <Input placeholder="https://cdn.jsdelivr.net/gh/user/repo@main/public" />
                    </Form.Item>
                    <Form.Item name="ophim_img_domain" label="Domain ảnh OPhim (fallback)">
                      <Input placeholder="https://img.ophim.live" />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'automation',
                label: 'Tự động & Build',
                children: (
                  <>
                    <Card title="Tối ưu Homepage (build sẵn dữ liệu section)" style={{ marginTop: 8 }}>
                      <Form.Item name="home_prebuild_enabled" label="Bật build sẵn home-sections-data.json" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_limit" label="Số phim tối đa mỗi mục (1–50)">
                        <Input type="number" min={1} max={50} placeholder="24" />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_series" label="Lấy Phim bộ (type=series)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_single" label="Lấy Phim lẻ (type=single)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_hoathinh" label="Lấy Hoạt hình (type=hoathinh)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_tvshows" label="Lấy TV Shows (type=tvshows)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_year" label="Lấy theo Năm" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_years" label="Danh sách năm (cách nhau bởi dấu phẩy, để trống = lấy tất cả section năm)">
                        <Input placeholder="2026,2025,2024" />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_genre" label="Lấy theo Thể loại" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_genres" label="Danh sách thể loại slug (cách nhau bởi dấu phẩy, để trống = lấy tất cả section thể loại)">
                        <Input placeholder="hanh-dong,tinh-cam,hai-huoc" />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_country" label="Lấy theo Quốc gia" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_countries" label="Danh sách quốc gia slug (cách nhau bởi dấu phẩy, để trống = lấy tất cả section quốc gia)">
                        <Input placeholder="au-my,han-quoc,trung-quoc" />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_quality_4k" label="Lấy Phim 4K (quality_4k)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_status_current" label="Lấy Phim đang chiếu (status=current)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_status_upcoming" label="Lấy Phim sắp chiếu (status=upcoming)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_status_theater" label="Lấy Phim chiếu rạp (status=theater)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_exclusive" label="Lấy Phim độc quyền (exclusive)" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_vietsub" label="Lấy Phim Vietsub" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_thuyetminh" label="Lấy Phim Thuyết minh" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="home_prebuild_enable_longtieng" label="Lấy Phim Lồng tiếng" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Card>
                  </>
                ),
              },
              {
                key: 'integrations',
                label: 'Tích hợp',
                children: (
                  <>
                    <Form.Item name="google_analytics_id" label="Google Analytics ID">
                      <Input placeholder="G-XXXXXXXXXX" />
                    </Form.Item>
                    <Form.Item name="simple_analytics_script" label="SimpleAnalytics (mã nhúng)">
                      <Input.TextArea rows={3} placeholder="<script>...</script>" />
                    </Form.Item>
                    <Form.Item name="supabase_user_url" label="Supabase User URL (website dùng)">
                      <Input placeholder="https://xxx.supabase.co" />
                    </Form.Item>
                    <Form.Item name="supabase_user_anon_key" label="Supabase User Anon Key">
                      <Input.Password placeholder="eyJ..." />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'ui',
                label: 'Giao diện',
                children: (
                  <>
                    <Form.Item name="player_visible" label="Hiển thị player trên trang xem phim" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <p style={{ color: '#666', fontSize: 12, marginTop: -8, marginBottom: 16 }}>Tắt = không hiển thị nút Xem / danh sách tập phát trên trang chi tiết phim.</p>

                    <Form.Item name="detail_hide_header_default" label="Mặc định ẩn Header ở trang chi tiết" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="watch_hide_header_default" label="Mặc định ẩn Header ở trang xem phim" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="movie_detail_similar_limit" label="Số lượng phim đề xuất ở trang chi tiết (4–50)">
                      <Input type="number" min={4} max={50} placeholder="16" />
                    </Form.Item>
                    <Form.Item name="tmdb_attribution" label="Hiển thị ghi nhận TMDB" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="loading_screen_enabled" label="Màn hình Loading khi mở trang" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="loading_screen_min_seconds" label="Thời gian tối đa hiển thị Loading (giây)">
                      <Input type="number" min={0} max={30} placeholder="0" />
                    </Form.Item>
                    <p style={{ color: '#666', fontSize: 12, marginTop: -8, marginBottom: 16 }}>Bật = hiện logo + chữ &quot;Loading...&quot;. Thời gian tối đa = màn Loading sẽ tắt sau tối đa X giây (ví dụ: 2 = tối đa 2 giây thì phải tắt; 0 = tắt ngay khi tải xong).</p>
                    <p style={{ color: '#888', fontSize: 12 }}>Grid &amp; Ảnh cho trang lọc/tìm kiếm: cấu hình tại <strong>Trang danh mục</strong> trong menu.</p>
                  </>
                ),
              },
              {
                key: 'footer',
                label: 'Footer & Social',
                children: (
                  <>
                    <Form.Item name="social_facebook" label="Facebook (URL)">
                      <Input placeholder="https://facebook.com/..." />
                    </Form.Item>
                    <Form.Item name="social_twitter" label="Twitter / X (URL)">
                      <Input placeholder="https://twitter.com/..." />
                    </Form.Item>
                    <Form.Item name="social_instagram" label="Instagram (URL)">
                      <Input placeholder="https://instagram.com/..." />
                    </Form.Item>
                    <Form.Item name="social_youtube" label="YouTube (URL)">
                      <Input placeholder="https://youtube.com/..." />
                    </Form.Item>
                    <Card title="Nội dung Footer" style={{ marginTop: 24 }}>
                      <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
                        Để trống = dùng footer mặc định (banner Trường Sa &amp; Hoàng Sa, logo — dùng chung ảnh Logo ở trên —, 3 link Hỏi đáp / Chính sách bảo mật / Điều khoản, copyright). Nếu nhập HTML bên dưới, toàn bộ nội dung footer sẽ thay bằng HTML này.
                      </p>
                      <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
                        Khi dùng HTML tùy chỉnh: giữ phần tử có class <code>footer-logo</code> (và <code>footer-logo-text</code> bên trong) nếu muốn logo + mô tả footer tự lấy từ cài đặt Logo / Tên site ở trên.
                      </p>
                      <Form.Item name="footer_content" label="HTML tùy chỉnh (để trống = mặc định)">
                        <Input.TextArea
                          rows={10}
                          placeholder="Để trống để dùng footer mặc định..."
                          style={{ fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </Form.Item>
                      <Button
                        type="default"
                        onClick={() => form.setFieldValue('footer_content', '')}
                        style={{ marginRight: 8 }}
                      >
                        Xóa (dùng mặc định)
                      </Button>
                      <Button type="default" onClick={() => form.setFieldValue('footer_content', DEFAULT_FOOTER_HTML)}>
                        Khôi phục mẫu mặc định
                      </Button>
                    </Card>
                  </>
                ),
              },
            ]}
          />
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
