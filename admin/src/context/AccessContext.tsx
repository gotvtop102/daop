import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { activateAccessWithCode, isAccessEnabled } from '../lib/accessGate';

type AccessContextValue = {
  hasAccess: boolean;
  unlockModalOpen: boolean;
  setUnlockModalOpen: (open: boolean) => void;
  submitCode: (code: string) => Promise<{ ok: boolean; message?: string }>;
  refreshAccess: () => void;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [hasAccess, setHasAccess] = useState(() => isAccessEnabled());
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const refreshAccess = useCallback(() => {
    setHasAccess(isAccessEnabled());
  }, []);

  const submitCode = useCallback(async (code: string) => {
    const r = await activateAccessWithCode(code);
    if (r.ok) {
      setHasAccess(true);
      setUnlockModalOpen(false);
      return { ok: true as const };
    }
    return { ok: false as const, message: r.message };
  }, []);

  const value = useMemo(
    () => ({
      hasAccess,
      unlockModalOpen,
      setUnlockModalOpen,
      submitCode,
      refreshAccess,
    }),
    [hasAccess, unlockModalOpen, submitCode, refreshAccess],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within AccessProvider');
  return ctx;
}
