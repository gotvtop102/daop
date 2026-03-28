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

const DEFAULT_CONTACT_HTML = `
<h2>Liên Hệ GoTV - Hỗ Trợ Khi Xem Phim Online</h2>
<h3>Liên hệ</h3>
<p>Chào mừng bạn đến với trang <strong>Liên Hệ</strong> của GoTV! Chúng tôi luôn sẵn sàng lắng nghe và hỗ trợ bạn để mang lại trải nghiệm tốt nhất khi sử dụng dịch vụ.</p>
<h3>1. Thông Tin Liên Hệ Chính</h3>
<p>Email hỗ trợ khách hàng: <strong>support@gotv.top</strong></p>
<ul>
<li><strong>Vấn đề tài khoản:</strong> Quên mật khẩu, không thể truy cập, và các vấn đề liên quan đến tài khoản.</li>
<li><strong>Hỗ trợ kỹ thuật:</strong> Sự cố khi xem phim, chất lượng video hoặc các lỗi khác khi sử dụng trang web.</li>
<li><strong>Đóng góp ý kiến:</strong> Chúng tôi trân trọng mọi ý kiến đóng góp từ bạn để nâng cao chất lượng dịch vụ.</li>
</ul>
<p>Email liên hệ về Chính Sách Riêng Tư: <strong>privacy@gotv.top</strong></p>
<p>Mọi thắc mắc liên quan đến bảo mật thông tin và chính sách riêng tư của GoTV.</p>
<h3>2. Liên Hệ Qua Mạng Xã Hội</h3>
<p>Ngoài email, bạn cũng có thể liên hệ và cập nhật thông tin mới nhất từ GoTV qua các kênh mạng xã hội của chúng tôi.</p>
<h3>3. Câu Hỏi Thường Gặp (F.A.Q)</h3>
<p>Trước khi gửi yêu cầu hỗ trợ, bạn có thể tham khảo trang <a href="/hoi-dap.html">Câu Hỏi Thường Gặp (F.A.Q)</a> để tìm câu trả lời nhanh cho các vấn đề phổ biến.</p>
<p>Chúng tôi rất vui khi được hỗ trợ bạn và mong muốn mang đến trải nghiệm xem phim trực tuyến tốt nhất! <strong>GoTV - Cùng bạn khám phá thế giới giải trí đa dạng, an toàn và miễn phí!</strong></p>
`.trim();

const DEFAULT_FAQ_HTML = `
<h2>Hỏi Đáp - GoTV</h2>
<h3>Một số câu hỏi được người dùng quan tâm nhất tại GoTV</h3>
<h4>1. GoTV là gì và có những đặc điểm nổi bật nào?</h4>
<p>GoTV là một trang web xem phim online miễn phí tại Việt Nam, cung cấp kho phim chất lượng HD và 4K, có tốc độ tải mượt mà. Trang web có giao diện thân thiện và thường xuyên cập nhật các bộ phim mới nhất từ nhiều quốc gia.</p>
<h4>2. GoTV có miễn phí hoàn toàn không?</h4>
<p>GoTV hoàn toàn miễn phí. Người dùng không cần trả phí hay đăng ký tài khoản để xem phim.</p>
<h4>3. GoTV có bao gồm các bộ phim chiếu rạp không?</h4>
<p>GoTV cung cấp nhiều bộ phim chiếu rạp đình đám từ Việt Nam và quốc tế, được cập nhật nhanh chóng.</p>
<h4>4. Tốc độ tải phim trên GoTV như thế nào?</h4>
<p>GoTV có tốc độ tải nhanh, ổn định nhờ hệ thống máy chủ hiện đại.</p>
<h4>5. Chất lượng phim trên GoTV có tốt không?</h4>
<p>GoTV cung cấp chất lượng phim từ HD đến 4K.</p>
<h4>6. GoTV có thể xem trên các thiết bị nào?</h4>
<p>GoTV có thể truy cập trên máy tính, điện thoại di động và máy tính bảng.</p>
<h4>7. GoTV có hỗ trợ thuyết minh và phụ đề không?</h4>
<p>Có, GoTV hỗ trợ nhiều tùy chọn thuyết minh và phụ đề đa ngôn ngữ.</p>
<h4>8. GoTV có phim lẻ và phim bộ không?</h4>
<p>Đúng vậy, GoTV cung cấp cả phim lẻ và phim bộ.</p>
<h4>9. GoTV có hỗ trợ phim hoạt hình không?</h4>
<p>Có, GoTV có kho phim hoạt hình phong phú.</p>
<h4>10. Có thể tìm kiếm phim dễ dàng trên GoTV không?</h4>
<p>Giao diện GoTV được thiết kế thân thiện, giúp tìm kiếm phim theo tên, thể loại, quốc gia.</p>
<h4>11. Có cần đăng ký tài khoản để xem phim trên GoTV không?</h4>
<p>Người dùng không cần đăng ký tài khoản mà vẫn có thể xem phim thoải mái.</p>
<h4>12. GoTV có bảo vệ quyền riêng tư cho người dùng không?</h4>
<p>GoTV đảm bảo quyền riêng tư của người dùng, không sử dụng dữ liệu cho mục đích quảng cáo.</p>
`.trim();

const DEFAULT_ABOUT_HTML = `
<h2>Giới Thiệu GoTV</h2>
<h3>GoTV - Nền Tảng Xem Phim Trực Tuyến Miễn Phí</h3>
<p>GoTV là nền tảng xem phim trực tuyến miễn phí, cung cấp không gian giải trí cho hàng triệu người dùng với tiêu chí chất lượng, tiện lợi và phong phú.</p>
<h3>Giao Diện Thân Thiện, Dễ Sử Dụng</h3>
<p>GoTV thiết kế giao diện tối giản, thân thiện để bạn dễ dàng khám phá và tìm kiếm những bộ phim yêu thích.</p>
<h3>Kho Phim Phong Phú</h3>
<p>GoTV mang đến hàng ngàn bộ phim thuộc nhiều thể loại: Phim Bộ, Phim Lẻ, Phim Việt Nam, từ nhiều quốc gia.</p>
<h3>Chất Lượng Video Đỉnh Cao - Từ HD đến 4K</h3>
<p>GoTV cung cấp phim với nhiều độ phân giải từ HD đến 4K.</p>
<h3>Tính Năng Nổi Bật</h3>
<ul><li>Xem Phim Miễn Phí Hoàn Toàn</li><li>Cập Nhật Phim Nhanh Chóng</li><li>Xem Phim Mọi Lúc, Mọi Nơi</li></ul>
<h3>Cam Kết</h3>
<p>Chúng tôi cam kết bảo vệ quyền lợi người dùng, bảo mật thông tin cá nhân tuyệt đối.</p>
<h3>Liên Hệ</h3>
<p>Liên hệ qua <a href="/lien-he.html">trang Liên Hệ</a> hoặc email support@gotv.top</p>
`.trim();

const DEFAULT_PRIVACY_HTML = `
<h2>Bảo Mật - Chính Sách Riêng Tư của GoTV</h2>
<p>Tại GoTV, chúng tôi cam kết bảo vệ quyền riêng tư và thông tin cá nhân của bạn khi truy cập và sử dụng trang web.</p>
<h3>Thông Tin Chúng Tôi Thu Thập</h3>
<p>Khi bạn đăng ký tài khoản, nhận bản tin, hoặc liên hệ với chúng tôi, chúng tôi có thể thu thập: tên, địa chỉ email, số điện thoại và các thông tin khác mà bạn cung cấp.</p>
<h3>Mục Đích Sử Dụng Thông Tin</h3>
<ul><li>Cung cấp và duy trì dịch vụ</li><li>Giao tiếp với người dùng</li><li>Phân tích và cải thiện</li><li>Bảo mật và tuân thủ pháp luật</li></ul>
<h3>Chia Sẻ Thông Tin</h3>
<p>GoTV cam kết không bán hoặc chia sẻ thông tin cá nhân với bên thứ ba, ngoại trừ khi có sự đồng ý của bạn hoặc theo yêu cầu pháp luật.</p>
<h3>Bảo Mật Thông Tin Cá Nhân</h3>
<p>Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức để bảo vệ thông tin của bạn.</p>
<h3>Quyền Riêng Tư của Người Dùng</h3>
<p>Bạn có quyền truy cập, chỉnh sửa và xóa thông tin cá nhân. Liên hệ: <strong>privacy@gotv.top</strong></p>
<h3>Cookies</h3>
<p>GoTV sử dụng cookies để cải thiện trải nghiệm người dùng. Bạn có thể điều chỉnh cài đặt cookies qua trình duyệt.</p>
<h3>Liên Hệ</h3>
<p>Mọi câu hỏi về Chính Sách Riêng Tư: <strong>privacy@gotv.top</strong></p>
`.trim();

const DEFAULT_TERMS_HTML = `
<h2>Điều Khoản Sử Dụng - GoTV</h2>
<p>Chào mừng bạn đến với GoTV, nền tảng xem phim trực tuyến miễn phí. Bằng việc truy cập và sử dụng dịch vụ, bạn đồng ý tuân thủ các điều khoản này.</p>
<h3>1. Chấp Nhận Điều Khoản</h3>
<p>Bạn đã đọc, hiểu và đồng ý với các điều khoản sử dụng. Nếu không đồng ý, vui lòng không tiếp tục sử dụng GoTV.</p>
<h3>2. Đăng Ký Tài Khoản</h3>
<p>Khi đăng ký, bạn cam kết: cung cấp thông tin chính xác; bảo mật thông tin đăng nhập; không sử dụng tài khoản cho hành vi vi phạm pháp luật.</p>
<h3>3. Hành Vi Bị Cấm</h3>
<p>Không đăng tải nội dung vi phạm bản quyền; không thực hiện hành vi gây hại hệ thống; không sử dụng thương mại mà không có sự đồng ý.</p>
<h3>4. Bảo Mật Thông Tin</h3>
<p>Vui lòng tham khảo <a href="/chinh-sach-bao-mat.html">Chính Sách Riêng Tư</a> để hiểu cách chúng tôi thu thập và bảo mật thông tin.</p>
<h3>5. Quyền Thay Đổi Dịch Vụ</h3>
<p>GoTV có quyền thay đổi, cập nhật hoặc ngừng cung cấp nội dung/dịch vụ; xóa hoặc tạm ngừng tài khoản nếu vi phạm.</p>
<h3>6. Miễn Trừ Trách Nhiệm</h3>
<p>GoTV không chịu trách nhiệm về gián đoạn truy cập, sự cố kỹ thuật, nội dung do bên thứ ba cung cấp.</p>
<h3>7. Thay Đổi Điều Khoản</h3>
<p>Chúng tôi có thể cập nhật điều khoản theo thời gian. Việc tiếp tục sử dụng đồng nghĩa chấp nhận điều khoản mới.</p>
<h3>8. Liên Hệ</h3>
<p>Mọi câu hỏi: <strong>support@gotv.top</strong></p>
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
              {
                key: 'about',
                label: 'Giới thiệu',
                children: (
                  <>
                    <Form.Item name="about_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item>
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Button onClick={() => form.setFieldValue('about_content', DEFAULT_ABOUT_HTML)}>
                        Chèn mẫu Giới thiệu
                      </Button>
                      <Button onClick={() => form.setFieldValue('about_content', '')}>
                        Xóa nội dung
                      </Button>
                    </Space>
                  </>
                ),
              },
              {
                key: 'contact',
                label: 'Liên hệ',
                children: (
                  <>
                    <Form.Item name="contact_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item>
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Button onClick={() => form.setFieldValue('contact_content', DEFAULT_CONTACT_HTML)}>
                        Chèn mẫu Liên hệ
                      </Button>
                      <Button onClick={() => form.setFieldValue('contact_content', '')}>
                        Xóa nội dung
                      </Button>
                    </Space>
                  </>
                ),
              },
              {
                key: 'faq',
                label: 'Hỏi-đáp',
                children: (
                  <>
                    <Form.Item name="faq_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item>
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Button onClick={() => form.setFieldValue('faq_content', DEFAULT_FAQ_HTML)}>
                        Chèn mẫu Hỏi-đáp
                      </Button>
                      <Button onClick={() => form.setFieldValue('faq_content', '')}>
                        Xóa nội dung
                      </Button>
                    </Space>
                  </>
                ),
              },
              {
                key: 'privacy',
                label: 'Chính sách bảo mật',
                children: (
                  <>
                    <Form.Item name="privacy_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item>
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Button onClick={() => form.setFieldValue('privacy_content', DEFAULT_PRIVACY_HTML)}>
                        Chèn mẫu Chính sách
                      </Button>
                      <Button onClick={() => form.setFieldValue('privacy_content', '')}>
                        Xóa nội dung
                      </Button>
                    </Space>
                  </>
                ),
              },
              {
                key: 'terms',
                label: 'Điều khoản sử dụng',
                children: (
                  <>
                    <Form.Item name="terms_content" label="Nội dung (HTML)"><RichTextEditor /></Form.Item>
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Button onClick={() => form.setFieldValue('terms_content', DEFAULT_TERMS_HTML)}>
                        Chèn mẫu Điều khoản
                      </Button>
                      <Button onClick={() => form.setFieldValue('terms_content', '')}>
                        Xóa nội dung
                      </Button>
                    </Space>
                  </>
                ),
              },
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
                            - APK: build từ dự án Capacitor Android (Android Studio), rồi upload lên host để lấy link — xem <code>docs/capacitor/README.md</code>.
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
