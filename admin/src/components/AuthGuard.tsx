import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { supabase } from '../lib/supabase';
import { setAccessEnabled } from '../lib/accessGate';
import { ensureAccessSubsystemLoaded } from '../lib/accessIntegrity';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const check = async () => {
      if (!ensureAccessSubsystemLoaded()) {
        setLoading(false);
        navigate('/login', { replace: true });
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAccessEnabled(false);
        setLoading(false);
        navigate('/login', { replace: true, state: { from: location.pathname } });
        return;
      }
      const role = (session.user?.app_metadata as { role?: string })?.role;
      if (role !== 'admin') {
        await supabase.auth.signOut();
        navigate('/login', { replace: true });
        setLoading(false);
        return;
      }
      setAuthenticated(true);
      setLoading(false);
    };
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAccessEnabled(false);
        setAuthenticated(false);
        navigate('/login', { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  return authenticated ? <>{children}</> : null;
}
