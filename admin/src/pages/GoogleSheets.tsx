import { Card, Typography, Alert, Space, Button, Form, Input, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const { Title, Paragraph, Text, Link } = Typography as any;

export default function GoogleSheetsPage() {
  const docsUrl = 'https://github.com/daop-movie/docs/google-sheets'; // chỉnh lại nếu repo khác

  const [form] = Form.useForm();
  const [sheetId, setSheetId] = useState('');
  const [savingSupabase, setSavingSupabase] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('daop_google_sheets_config') || '{}');
      const nextSheetId = saved?.google_sheets_id || '';
      setSheetId(nextSheetId);
      form.setFieldsValue({
        google_sheets_id: nextSheetId,
      });
    } catch {
      // ignore
    }
  }, [form]);

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('key, value')
      .eq('key', 'google_sheets_id')
      .maybeSingle()
      .then((r) => {
        if (r.error) return;
        const v = String((r.data as any)?.value ?? '').trim();
        if (!v) return;
        setSheetId((curr) => {
          if (String(curr || '').trim()) return curr;
          form.setFieldsValue({ google_sheets_id: v });
          return v;
        });
      });
  }, [form]);

  const sheetUrl = useMemo(() => {
    const id = String(sheetId || '').trim();
    if (!id) return '';
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
  }, [sheetId]);

  const handleSaveConfig = async (values: any) => {
    const id = String(values?.google_sheets_id || '').trim();
    setSheetId(id);

    localStorage.setItem(
      'daop_google_sheets_config',
      JSON.stringify({
        google_sheets_id: id,
      })
    );
    message.success('Đã lưu link Google Sheets (localStorage)');
  };

  const handleSaveToSupabase = async () => {
    const id = String(sheetId || '').trim();
    if (!id) {
      message.error('Chưa có GOOGLE_SHEETS_ID');
      return;
    }
    setSavingSupabase(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'google_sheets_id', value: id, updated_at: now }, { onConflict: 'key' });
      if (error) throw error;
      message.success('Đã lưu GOOGLE_SHEETS_ID lên Supabase');
    } catch (e: any) {
      message.error(e?.message || 'Lưu Supabase thất bại');
    } finally {
      setSavingSupabase(false);
    }
  };

  return (
    <>
      <Title level={1}>Google Sheets – Phim custom</Title>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Google Sheets đang được dùng làm nơi nhập phim custom và tập phim (movies, episodes)."
          description="Build sẽ tự đọc dữ liệu từ Google Sheets (hoặc Excel fallback) theo cấu trúc trong docs/google-sheets/README.md."
        />

        <Card title="1. Lưu link Google Sheets để truy cập nhanh">

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSaveConfig}
            initialValues={{
              google_sheets_id: '',
            }}
          >
            <Form.Item
              name="google_sheets_id"
              label="GOOGLE_SHEETS_ID"
              extra="ID trong URL dạng: https://docs.google.com/spreadsheets/d/<ID>/edit"
              rules={[{ required: true, message: 'Nhập Google Sheets ID' }]}
            >
              <Input
                placeholder="VD: 1AbC...xyz"
                onChange={(e) => setSheetId(e.target.value)}
              />
            </Form.Item>

            <Space wrap>
              <Button type="primary" htmlType="submit">
                Lưu cấu hình
              </Button>

              <Button type="primary" loading={savingSupabase} onClick={handleSaveToSupabase} disabled={!sheetId}>
                Lưu cấu hình
              </Button>

              <Button
                type="link"
                href={sheetUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                disabled={!sheetUrl}
              >
                Mở Google Sheet
              </Button>
            </Space>
          </Form>
        </Card>

        <Card title="2. Mở file Google Sheets">
          <Paragraph>
            <Text>
              File Google Sheets dùng cho phim custom được cấu hình bằng các biến môi trường{' '}
              <Text code>GOOGLE_SHEETS_ID</Text> và <Text code>GOOGLE_SERVICE_ACCOUNT_KEY</Text> trong môi
              trường build (GitHub Actions / máy local).
            </Text>
          </Paragraph>
          <Paragraph>
            <Text>
              ID sheet nằm trong URL dạng <Text code>https://docs.google.com/spreadsheets/d/&lt;ID&gt;/edit</Text>. Hãy
              chắc chắn bạn đã chia sẻ sheet cho service account với quyền Editor.
            </Text>
          </Paragraph>
          <Paragraph>
            <Text>
              Để chỉnh sửa trực quan từng phim hoặc nhiều phim cùng lúc, hãy mở trực tiếp file Google Sheets và thao tác
              trên 2 tab <Text code>movies</Text> và <Text code>episodes</Text>.
            </Text>
          </Paragraph>
          <Paragraph>
            <Text type="secondary">
              Gợi ý: Lưu URL sheet trong phần &quot;Trang tĩnh&quot; hoặc ghi chú nội bộ để admin dễ truy cập.
            </Text>
          </Paragraph>
        </Card>

        <Card title="3. Cấu trúc sheet (movies, episodes) – kiểu MỚI">
          <Paragraph>
            <Text strong>Tab movies</Text> dùng để nhập thông tin chính của phim (title, origin_name, năm, thể loại,
            quốc gia, chất lượng, status, showtimes, is_exclusive, tmdb_id,...).
          </Paragraph>
          <Paragraph>
            <Text strong>Tab episodes</Text> (kiểu mới) dùng để nhập tập phim và nguồn server.
            <br />
            Mỗi dòng = <Text strong>1 tập trên 1 server</Text> (tránh cột JSON dài).
          </Paragraph>
          <Paragraph>
            <Text>
              Các cột quan trọng trong <Text code>episodes</Text>:
              <br />
              <Text code>movie_id</Text>, <Text code>episode_code</Text>, <Text code>episode_name</Text>,{' '}
              <Text code>server_slug</Text>, <Text code>server_name</Text>,{' '}
              <Text code>link_m3u8</Text>, <Text code>link_embed</Text>, <Text code>link_backup</Text>,{' '}
              <Text code>link_vip1</Text>.. <Text code>link_vip5</Text>, <Text code>note</Text>.
            </Text>
          </Paragraph>
          <Paragraph>
            <Text>
              <Text strong>Ghi chú các cột thường dùng:</Text>
              <br />
              <Text code>showtimes</Text>: lịch chiếu/tần suất ra tập (vd. "Tập mới mỗi thứ 6").
              <br />
              <Text code>is_exclusive</Text>: phim độc quyền. Nhận 0/1 hoặc true/false.
              <br />
              <Text code>update</Text>: NEW/OK/COPY (tùy chọn) để kiểm soát build & export.
              <br />
              <Text code>note</Text>: ghi chú nội bộ cho admin (không dùng để hiển thị).
            </Text>
          </Paragraph>
          <Paragraph>
            <Text>
              Chi tiết đầy đủ xem trong tài liệu{' '}
              <Link href={docsUrl} target="_blank" rel="noopener noreferrer">
                docs/google-sheets/README.md
              </Link>
              .
            </Text>
          </Paragraph>
        </Card>

        <Card title="4. Quy trình thêm / chỉnh sửa phim custom">
          <Paragraph>
            <ol>
              <li>
                Mở Google Sheets (tab <Text code>movies</Text>, <Text code>episodes</Text>).
              </li>
              <li>
                <Text strong>Thêm phim mới</Text>: thêm 1 dòng vào tab <Text code>movies</Text>, điền đủ các cột cần
                thiết (ít nhất là <Text code>title</Text>, <Text code>type</Text>, <Text code>year</Text>,{' '}
                <Text code>genre</Text>, <Text code>country</Text>).
              </li>
              <li>
                Ghi nhớ hoặc điền sẵn <Text code>id</Text> cho phim, sau đó sang tab <Text code>episodes</Text> điền{' '}
                <Text code>movie_id</Text> tương ứng và điền các dòng tập theo cấu trúc mới (episode_code/server_slug/link...).
              </li>
              <li>
                <Text strong>Chỉnh sửa 1 hoặc nhiều phim</Text>: lọc / sort trên Google Sheets, sửa trực tiếp các dòng
                cần thay đổi (có thể copy/paste hàng loạt).
              </li>
              <li>
                Sau khi chỉnh sửa, vào mục <Text code>GitHub Actions</Text> trong Admin và chạy workflow{' '}
                <Text code>Update data daily</Text> hoặc <Text code>Build on demand</Text> để build lại dữ liệu ra
                website.
              </li>
            </ol>
          </Paragraph>
          <Paragraph>
            <Text type="secondary">
              Lưu ý: Build luôn đọc lại toàn bộ dữ liệu từ sheet, và merge với phim từ OPhim. Mỗi lần bạn thêm dòng mới
              trong sheet là thêm phim mới vào website; chỉnh sửa dòng cũ là cập nhật phim cũ.
            </Text>
          </Paragraph>
          <Paragraph>
            <Button type="link" href={docsUrl} target="_blank" rel="noopener noreferrer">
              Xem hướng dẫn chi tiết trong docs/google-sheets
            </Button>
          </Paragraph>
        </Card>
      </Space>
    </>
  );
}

