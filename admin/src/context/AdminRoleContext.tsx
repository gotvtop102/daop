import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type AdminRoleContextValue = {
  loading: boolean;
  isAdmin: boolean;
};

const AdminRoleContext = createContext<AdminRoleContextValue | null>(null);

function roleFromSession(session: any): string {
  const role = (session?.user?.app_metadata as { role?: string } | undefined)?.role;
  return String(role || '').trim().toLowerCase();
}

export function AdminRoleProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      const role = roleFromSession(data?.session);
      if (alive) {
        setIsAdmin(role === 'admin');
        setLoading(false);
      }
    };
    void sync();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const role = roleFromSession(session);
      setIsAdmin(role === 'admin');
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ loading, isAdmin }), [loading, isAdmin]);
  return <AdminRoleContext.Provider value={value}>{children}</AdminRoleContext.Provider>;
}

export function useAdminRole() {
  const ctx = useContext(AdminRoleContext);
  if (!ctx) throw new Error('useAdminRole must be used within AdminRoleProvider');
  return ctx;
}

