import { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Button, message, Select } from 'antd';
import { supabase } from '../lib/supabase';

const METHOD_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'paypal', label: 'PayPal' },
  { value: 'btc', label: 'Bitcoin (BTC)' },
  { value: 'eth', label: 'Ethereum (ETH)' },
  { value: 'ltc', label: 'Litecoin (LTC)' },
  { value: 'usdt_trc20', label: 'USDT (TRC20)' },
  { value: 'usdt_erc20', label: 'USDT (ERC20)' },
  { value: 'bnb_bep20', label: 'BNB (BEP20)' },
  { value: 'sol', label: 'Solana (SOL)' },
  { value: 'custom', label: 'Custom' },
];

function normalizeMethods(input: any): any[] {
  const raw = Array.isArray(input) ? input : [];
  return raw.map((m) => {
    if (!m) return { type: 'custom', custom_label: '', url: '', note: '' };
    if (typeof m.type === 'string') {
      return {
        type: m.type,
        custom_label: typeof m.custom_label === 'string' ? m.custom_label : '',
        url: typeof m.url === 'string' ? m.url : '',
        note: typeof m.note === 'string' ? m.note : '',
      };
    }
    const label = typeof m.label === 'string' ? m.label : '';
    return {
      type: 'custom',
      custom_label: label,
      url: typeof m.url === 'string' ? m.url : '',
      note: typeof m.note === 'string' ? m.note : '',
    };
  });
}

export default function DonateSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await supabase.from('donate_settings').select('*').limit(1).maybeSingle();
        if (r.data) {
          const base: any = { ...r.data };
          const methods = normalizeMethods(base.methods);
          const hasPaypal = methods.some((m) => m && m.type === 'paypal');
          if (base.paypal_link && !hasPaypal) {
            methods.unshift({ type: 'paypal', custom_label: '', url: String(base.paypal_link), note: '' });
          }
          base.methods = methods;
          form.setFieldsValue(base);
        } else form.setFieldsValue({
          target_amount: 0,
          current_amount: 0,
          target_currency: 'VND',
          methods: [
            { type: 'paypal', custom_label: '', url: '', note: '' },
            { type: 'btc', custom_label: '', url: '', note: '' },
            { type: 'eth', custom_label: '', url: '', note: '' },
            { type: 'ltc', custom_label: '', url: '', note: '' },
            { type: 'usdt_trc20', custom_label: '', url: '', note: '' },
            { type: 'usdt_erc20', custom_label: '', url: '', note: '' },
            { type: 'bnb_bep20', custom_label: '', url: '', note: '' },
            { type: 'sol', custom_label: '', url: '', note: '' },
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
      const methods = normalizeMethods(rest.methods);
      const paypal = methods.find((m) => m && m.type === 'paypal');
      rest.methods = methods;
      rest.paypal_link = paypal && paypal.url ? paypal.url : '';
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
      <p style={{ color: '#666', marginBottom: 16 }}>
        Sau khi lưu, cần chạy Build website để áp dụng lên trang donate.
      </p>
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
          <Form.List name="methods">
            {(fields, { add, remove }) => (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>Các phương thức Donate (phổ biến + Custom)</h3>
                  <Button onClick={() => add({ type: 'custom', custom_label: '', url: '', note: '' })}>Thêm phương thức</Button>
                </div>
                <div style={{ height: 12 }} />
                <Card size="small">
                  <div style={{ display: 'flex', gap: 12, fontWeight: 600, padding: '4px 0' }}>
                    <div style={{ flex: 2 }}>Phương thức</div>
                    <div style={{ flex: 2 }}>Tên Custom</div>
                    <div style={{ flex: 3 }}>Link / QR</div>
                    <div style={{ flex: 3 }}>Ghi chú</div>
                    <div style={{ width: 80 }}></div>
                  </div>
                  <div style={{ height: 8 }} />
                  {fields.map((field) => (
                    <div key={field.key} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                      <Form.Item {...field} name={[field.name, 'type']} style={{ flex: 2, marginBottom: 0 }}>
                        <Select options={METHOD_PRESETS} />
                      </Form.Item>

                      <Form.Item
                        noStyle
                        shouldUpdate={(prev: any, next: any) => prev?.methods?.[field.name]?.type !== next?.methods?.[field.name]?.type}
                      >
                        {({ getFieldValue }: any) => {
                          const t = getFieldValue(['methods', field.name, 'type']);
                          const disabled = t !== 'custom';
                          return (
                            <Form.Item {...field} name={[field.name, 'custom_label']} style={{ flex: 2, marginBottom: 0 }}>
                              <Input placeholder="Nhập tên" disabled={disabled} />
                            </Form.Item>
                          );
                        }}
                      </Form.Item>

                      <Form.Item {...field} name={[field.name, 'url']} style={{ flex: 3, marginBottom: 0 }}>
                        <Input placeholder="https://..." />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'note']} style={{ flex: 3, marginBottom: 0 }}>
                        <Input placeholder="Ghi chú" />
                      </Form.Item>
                      <div style={{ width: 80, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button danger onClick={() => remove(field.name)}>Xoá</Button>
                      </div>
                    </div>
                  ))}
                  {!fields.length ? <div style={{ color: '#8b949e' }}>Chưa có phương thức nào.</div> : null}
                </Card>
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
