import { useEffect, useState, useRef } from 'react';
import { Card, Form, Input, Button, Switch, message } from 'antd';
import { supabase } from '../lib/supabase';

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
  'logo_url',
  'favicon_url',
  'r2_img_domain',
  'ophim_img_domain',
  'upload_images_after_build',
  'update_data_two_phase',
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
  'google_analytics_id',
  'simple_analytics_script',
  'twikoo_env_id',
  'supabase_user_url',
  'supabase_user_anon_key',
  'player_warning_enabled',
  'player_warning_text',
  'player_visible',
  'movie_detail_similar_limit',
  'movies_data_url',
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('site_settings').select('key, value').then((r) => {
      const data = (r.data ?? []).reduce((acc: Record<string, any>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      form.setFieldsValue({
        site_name: data.site_name ?? 'DAOP Phim',
        logo_url: data.logo_url ?? '',
        favicon_url: data.favicon_url ?? '',
        r2_img_domain: data.r2_img_domain ?? 'https://pub-62eef44669df48e4bca5388a38e69522.r2.dev',
        ophim_img_domain: data.ophim_img_domain ?? 'https://img.ophim.live',
        upload_images_after_build: data.upload_images_after_build === 'true' || data.upload_images_after_build === '1',
        update_data_two_phase: data.update_data_two_phase === 'true' || data.update_data_two_phase === '1',
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
        google_analytics_id: data.google_analytics_id ?? '',
        simple_analytics_script: data.simple_analytics_script ?? '',
        twikoo_env_id: data.twikoo_env_id ?? '',
        supabase_user_url: data.supabase_user_url ?? '',
        supabase_user_anon_key: data.supabase_user_anon_key ?? '',
        player_warning_enabled: data.player_warning_enabled !== 'false',
        player_warning_text: data.player_warning_text ?? 'Cảnh báo: Phim chứa hình ảnh đường lưỡi bò phi pháp xâm phạm chủ quyền biển đảo Việt Nam.',
        player_visible: data.player_visible !== 'false',
        movie_detail_similar_limit: data.movie_detail_similar_limit ?? '16',
        movies_data_url: data.movies_data_url ?? '',
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
    try {
      const toSave: Record<string, string> = {};
      for (const key of SITE_SETTINGS_KEYS) {
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
    }
  };

  return (
    <>
      <h1>Cài đặt chung</h1>
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="site_name" label="Tên website">
            <Input />
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
                          const apiBase = ((import.meta as any).env?.VITE_API_URL || window.location.origin).replace(/\/$/, '');
                          const r = await fetch(apiBase + '/api/upload-image', {
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
                          message.error('Lỗi kết nối API upload. Cần deploy Admin lên Vercel và cấu hình R2.');
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
                          const apiBase = ((import.meta as any).env?.VITE_API_URL || window.location.origin).replace(/\/$/, '');
                          const r = await fetch(apiBase + '/api/upload-image', {
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
                          message.error('Lỗi kết nối API upload. Cần deploy Admin lên Vercel và cấu hình R2.');
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
          <Form.Item name="r2_img_domain" label="Domain ảnh R2 (ưu tiên)">
            <Input placeholder="https://... (để trống = không dùng R2)" />
          </Form.Item>
          <Form.Item name="ophim_img_domain" label="Domain ảnh OPhim (fallback)">
            <Input placeholder="https://img.ophim.live" />
          </Form.Item>
          <Form.Item name="upload_images_after_build" label="Tự động upload ảnh lên R2 sau khi Update data (schedule)" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="update_data_two_phase" label="Update data theo 2-phase (core -> tmdb) khi chạy schedule" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Card title="Tối ưu Homepage (build sẵn dữ liệu section)" style={{ marginTop: 16 }}>
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
          </Card>
          <Form.Item name="google_analytics_id" label="Google Analytics ID">
            <Input placeholder="G-XXXXXXXXXX" />
          </Form.Item>
          <Form.Item name="simple_analytics_script" label="SimpleAnalytics (mã nhúng)">
            <Input.TextArea rows={3} placeholder="<script>...</script>" />
          </Form.Item>
          <Form.Item name="twikoo_env_id" label="Twikoo Env ID (URL hoặc id)">
            <Input placeholder="https://xxx.vercel.app" />
          </Form.Item>
          <Form.Item name="supabase_user_url" label="Supabase User URL (website dùng)">
            <Input placeholder="https://xxx.supabase.co" />
          </Form.Item>
          <Form.Item name="supabase_user_anon_key" label="Supabase User Anon Key">
            <Input.Password placeholder="eyJ..." />
          </Form.Item>
          <Form.Item name="player_visible" label="Hiển thị player trên trang xem phim" valuePropName="checked">
            <Switch />
          </Form.Item>
          <p style={{ color: '#666', fontSize: 12, marginTop: -8, marginBottom: 16 }}>Tắt = không hiển thị nút Xem / danh sách tập phát trên trang chi tiết phim.</p>
          <Form.Item name="player_warning_enabled" label="Hiển thị cảnh báo dưới player" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="player_warning_text" label="Nội dung cảnh báo">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="movies_data_url" label="URL dữ liệu phim (movies-light.js)">
            <Input placeholder="https://your-site.com/data/movies-light.js" />
          </Form.Item>
          <p style={{ color: '#666', fontSize: 12, marginTop: -8, marginBottom: 16 }}>Dùng cho Slider: thêm slide từ link phim. Để trống = tắt.</p>

          <Form.Item name="movie_detail_similar_limit" label="Số lượng phim đề xuất ở trang chi tiết (4–50)">
            <Input type="number" min={4} max={50} placeholder="16" />
          </Form.Item>
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
          <Form.Item>
            <Button type="primary" htmlType="submit">Lưu</Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
