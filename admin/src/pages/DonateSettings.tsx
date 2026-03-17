import { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Button, message, Space } from 'antd';
import { supabase } from '../lib/supabase';

export default function DonateSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await supabase.from('donate_settings').select('*').limit(1).maybeSingle();
        if (r.data) form.setFieldsValue(r.data);
        else form.setFieldsValue({
          target_amount: 0,
          current_amount: 0,
          target_currency: 'VND',
          paypal_link: '',
          methods: [
            { label: 'Bitcoin (BTC)', url: '', note: '' },
            { label: 'Ethereum (ETH)', url: '', note: '' },
            { label: 'Litecoin (LTC)', url: '', note: '' },
            { label: 'USDT (TRC20)', url: '', note: '' },
            { label: 'USDT (ERC20)', url: '', note: '' },
            { label: 'BNB (BEP20)', url: '', note: '' },
            { label: 'Solana (SOL)', url: '', note: '' },
          ],
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  const onFinish = async (values: any) => {
    try {
      const { id, ...rest } = values;
      if (id) {
        const { error } = await supabase.from('donate_settings').upsert({ id, ...rest }, { onConflict: 'id' });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('donate_settings').insert(rest).select('id').single();
        if (error) throw error;
        if (data?.id) form.setFieldValue('id', data.id);
      }
      message.success('Đã lưu Donate');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  return (
    <>
      <h1>Quản lý Donate</h1>
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="id" hidden><Input type="hidden" /></Form.Item>
          <Form.Item name="target_amount" label="Mục tiêu (số tiền)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="target_currency" label="Đơn vị tiền tệ">
            <Input placeholder="VND" />
          </Form.Item>
          <Form.Item name="current_amount" label="Đã quyên góp">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="paypal_link" label="Link PayPal">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.List name="methods">
            {(fields, { add, remove }) => (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>Các phương thức Donate (phổ biến + Custom)</h3>
                  <Button onClick={() => add({ label: '', url: '', note: '' })}>Thêm phương thức</Button>
                </div>
                <div style={{ height: 12 }} />
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 12 }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Form.Item {...field} name={[field.name, 'label']} label="Tên phương thức">
                        <Input placeholder="MoMo / ZaloPay / VietQR / Custom..." />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'url']} label="Link (hoặc link ảnh QR)">
                        <Input placeholder="https://..." />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'note']} label="Ghi chú (tuỳ chọn)">
                        <Input placeholder="VD: Nội dung chuyển khoản, username, ..." />
                      </Form.Item>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button danger onClick={() => remove(field.name)}>Xoá</Button>
                      </div>
                    </Space>
                  </Card>
                ))}
              </>
            )}
          </Form.List>
          <Form.Item>
            <Button type="primary" htmlType="submit">Lưu</Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
