import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { SafetyOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = (session?.user?.app_metadata as { role?: string })?.role;
      if (session && role === 'admin') navigate('/', { replace: true });
    });
  }, [navigate]);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        message.error(error.message || 'Đăng nhập thất bại');
        setLoading(false);
        return;
      }
      const role = (data.user?.app_metadata as { role?: string })?.role;
      if (role !== 'admin') {
        await supabase.auth.signOut();
        message.error('Tài khoản không có quyền admin.');
        setLoading(false);
        return;
      }
      message.success('Đăng nhập thành công');
      navigate('/', { replace: true });
    } catch (e: any) {
      message.error(e?.message || 'Lỗi đăng nhập');
    }
    setLoading(false);
  };

  return (
    <div className="login-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <SafetyOutlined />
          </div>
        </div>
        <h2 style={{ textAlign: 'center', color: '#e6edf3', margin: '0 0 8px 0', fontSize: 24, fontWeight: 600 }}>
          DAOP Admin
        </h2>
        <div className="login-subtitle">
          Đăng nhập để quản lý website
        </div>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="email"
            rules={[{ required: true, type: 'email', message: 'Vui lòng nhập email hợp lệ' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#6e7681' }} />}
              placeholder="admin@example.com"
              size="large"
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#6e7681' }} />}
              placeholder="••••••••"
              size="large"
            />
          </Form.Item>
          <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
        <div className="login-footer">
          Code made by <strong>GoTV Admin Tieucot</strong>
          <br />
          Telegram:{' '}
          <a
            href="https://t.me/tieucot520"
            target="_blank"
            rel="noopener noreferrer"
          >
            @tieucot520
          </a>
        </div>
      </Card>
    </div>
  );
}
