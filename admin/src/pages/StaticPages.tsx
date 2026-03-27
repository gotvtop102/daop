import { useEffect, useRef, useState } from 'react';
import { Card, Form, Input, Button, Tabs, message, Alert, Space } from 'antd';
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

const DEFAULT_APP_GUIDE_HTML = `
<div class="app-guide-section">
  <h2><span class="platform-icon">📱</span>1. Cài đặt trên điện thoại Android (APK)</h2>
  <h3>Bước 1: Tải file APK</h3>
  <p>Nhấn vào nút bên dưới để tải file APK về điện thoại:</p>
  <div class="download-buttons">
    <a href="#" id="apk-link" class="download-btn">📥 Tải APK (Điện thoại Android)</a>
  </div>
  <h3>Bước 2: Cho phép cài đặt từ nguồn không xác định</h3>
  <ol>
    <li>Mở <strong>Cài đặt</strong> (Settings) trên điện thoại</li>
    <li>Tìm và chọn <strong>Bảo mật</strong> (Security) hoặc <strong>Ứng dụng</strong> (Apps)</li>
    <li>Bật tùy chọn <strong>"Cho phép cài đặt ứng dụng từ nguồn không xác định"</strong> (Install unknown apps)</li>
    <li>Chọn trình duyệt bạn dùng để tải APK (Chrome, Safari...) và bật cho phép</li>
  </ol>
  <h3>Bước 3: Cài đặt ứng dụng</h3>
  <ol>
    <li>Mở file APK đã tải trong thông báo tải xuống hoặc vào <strong>Files/Download</strong></li>
    <li>Chạm vào file APK và chọn <strong>Cài đặt</strong> (Install)</li>
    <li>Đợi quá trình cài đặt hoàn tất</li>
    <li>Mở ứng dụng và đăng nhập tài khoản để sử dụng</li>
  </ol>
  <div class="warning-box">
    <strong>Lưu ý:</strong> Một số điện thoại Samsung, Xiaomi, OPPO, Vivo có thể hiển thị cảnh báo bảo mật. Hãy chọn "Cài đặt bất chấp" hoặc "Tiếp tục cài đặt" để hoàn tất.
  </div>
</div>

<div class="app-guide-section">
  <h2><span class="platform-icon">📺</span>2. Cài đặt trên Android TV</h2>
  <h3>Tải file APK Android TV</h3>
  <p>Nhấn nút bên dưới để tải đúng bản APK dành riêng cho Android TV/TV Box:</p>
  <div class="download-buttons">
    <a href="#" id="apk-tv-link" class="download-btn download-btn--tv">📺 Tải APK (Android TV)</a>
  </div>
  <h3>Cách 1: Cài qua USB (Khuyên dùng)</h3>
  <ol>
    <li>Tải file APK trên máy tính/điện thoại</li>
    <li>Chép file APK vào USB</li>
    <li>Cắm USB vào Android TV</li>
    <li>Trên TV, mở <strong>File Manager</strong> hoặc <strong>Quản lý file</strong></li>
    <li>Tìm và chọn file APK từ USB</li>
    <li>Chọn <strong>Cài đặt</strong></li>
  </ol>
  <h3>Cách 2: Cài qua ứng dụng Send Files to TV</h3>
  <ol>
    <li>Cài ứng dụng <strong>Send Files to TV</strong> từ CH Play trên cả TV và điện thoại</li>
    <li>Tải APK GoTV trên điện thoại</li>
    <li>Mở app Send Files to TV trên điện thoại, chọn file APK và gửi đến TV</li>
    <li>Trên TV, chấp nhận file và cài đặt</li>
  </ol>
  <h3>Cách 3: Dùng ADB (dành cho người dùng nâng cao)</h3>
  <ol>
    <li>Bật <strong>Developer Options</strong> và <strong>USB Debugging</strong> trên TV</li>
    <li>Kết nối TV và máy tính cùng mạng WiFi</li>
    <li>Dùng lệnh ADB: <code>adb connect [IP_TV]</code></li>
    <li>Cài APK: <code>adb install gotv.apk</code></li>
  </ol>
  <div class="note-box">
    <strong>Mẹo:</strong> Một số Android TV (Sony, TCL, Google TV) có thể cần bật "Unknown sources" trong Settings &gt; Security &amp; Restrictions.
  </div>
</div>

<div class="app-guide-section">
  <h2><span class="platform-icon">🍎</span>3. Cài đặt trên iOS qua TestFlight</h2>
  <h3>Bước 1: Cài đặt TestFlight</h3>
  <ol>
    <li>Mở <strong>App Store</strong> trên iPhone/iPad</li>
    <li>Tìm kiếm <strong>TestFlight</strong></li>
    <li>Cài đặt ứng dụng TestFlight (miễn phí, của Apple)</li>
  </ol>
  <h3>Bước 2: Tham gia thử nghiệm GoTV</h3>
  <p>Nhấn vào liên kết TestFlight bên dưới:</p>
  <div class="download-buttons">
    <a href="#" id="testflight-link" class="download-btn download-btn--ios">🍎 Tải qua TestFlight</a>
  </div>
  <ol>
    <li>Nhấn vào liên kết TestFlight hoặc mở TestFlight app</li>
    <li>Chọn <strong>Accept</strong> (Chấp nhận) để tham gia thử nghiệm</li>
    <li>Chọn <strong>Install</strong> (Cài đặt) để tải GoTV</li>
    <li>Đợi tải xong và mở ứng dụng</li>
  </ol>
  <h3>Bước 3: Cập nhật ứng dụng</h3>
  <p>Khi có phiên bản mới, bạn sẽ nhận thông báo trong TestFlight. Mở TestFlight và chọn <strong>Update</strong> để cập nhật.</p>
  <div class="note-box">
    <strong>Lưu ý quan trọng:</strong>
    <ul>
      <li>TestFlight chỉ hỗ trợ iOS 12.0 trở lên</li>
      <li>Phiên bản TestFlight có thời hạn 90 ngày, sau đó cần cập nhật</li>
    </ul>
  </div>
</div>

<div class="app-guide-section">
  <h2><span class="platform-icon">❓</span>Câu hỏi thường gặp</h2>
  <h3>APK bị báo virus?</h3>
  <p>Đây là cảnh báo sai do ứng dụng chưa có trên CH Play. GoTV APK an toàn, bạn có thể quét bằng VirusTotal để kiểm chứng.</p>
  <h3>Không cài được trên Android 14+?</h3>
  <p>Android 14 yêu cầu cấp quyền riêng cho từng trình duyệt. Vào <strong>Settings &gt; Apps &gt; Special app access &gt; Install unknown apps</strong>, chọn Chrome và bật "Allow from this source".</p>
  <h3>TestFlight báo "This beta is full"?</h3>
  <p>Slot thử nghiệm đã đầy. Vui lòng liên hệ admin hoặc đợi thêm slot mở ra.</p>
  <h3>Android TV không nhận file APK?</h3>
  <p>Một số TV cần cài thêm <strong>File Commander</strong> hoặc <strong>X-plore File Manager</strong> từ CH Play để đọc file APK.</p>
</div>
`.trim();

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
        apk_tv_link: (find('app_guide') as any)?.apk_tv_link ?? '',
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
        {
          page_key: 'app_guide',
          content: values.app_guide_content,
          apk_link: values.apk_link ?? null,
          apk_tv_link: values.apk_tv_link ?? null,
          testflight_link: values.testflight_link ?? null,
          updated_at: new Date().toISOString(),
        },
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
        Sau khi lưu, cần chạy Build website (GitHub Actions) để xuất nội dung ra site.
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
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="Cập nhật trang hướng dẫn cài app"
                      description={
                        <div>
                          <div>
                            - Nhập nội dung hướng dẫn + dán link tải APK điện thoại / APK Android TV / TestFlight iOS.
                          </div>
                          <div>
                            - Sau khi bấm <b>Lưu</b>, vào trang <b>GitHub Actions</b> và chạy <b>Build website</b> để nội dung lên site.
                          </div>
                          <div>
                            - APK được build từ bộ công cụ riêng (Build App GoTV) và upload lên host của bạn để lấy link.
                          </div>
                        </div>
                      }
                    />
                    <Form.Item name="app_guide_content" label="Nội dung"><RichTextEditor /></Form.Item>
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Button
                        onClick={() => {
                          const cur = String(form.getFieldValue('app_guide_content') || '').trim();
                          if (!cur) form.setFieldValue('app_guide_content', DEFAULT_APP_GUIDE_HTML);
                          else form.setFieldValue('app_guide_content', DEFAULT_APP_GUIDE_HTML);
                        }}
                      >
                        Chèn mẫu đầy đủ (giống HTML hiện tại)
                      </Button>
                      <Button onClick={() => form.setFieldValue('app_guide_content', '')}>
                        Xóa nội dung (dùng mặc định trên site)
                      </Button>
                    </Space>
                    <Form.Item name="apk_link" label="Link APK điện thoại (Android)"><Input placeholder="https://..." /></Form.Item>
                    <Form.Item name="apk_tv_link" label="Link APK Android TV (riêng)"><Input placeholder="https://..." /></Form.Item>
                    <Form.Item name="testflight_link" label="Link TestFlight (iOS)"><Input placeholder="https://..." /></Form.Item>
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
