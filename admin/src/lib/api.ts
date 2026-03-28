/**
 * Base URL cho các request `/api/*`.
 *
 * - **Dev (Vite):** luôn dùng `window.location.origin` để request tới `/api` trên dev server;
 *   `vite.config` proxy `/api` → `VITE_API_URL` (URL deploy có serverless, ví dụ Vercel).
 * - **Production:** `VITE_API_URL` lúc build (nếu admin và API khác domain) hoặc cùng origin với trang admin.
 */
export function getApiBaseUrl(): string {
  const env = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  if (import.meta.env.DEV) {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }
  return env || (typeof window !== 'undefined' ? window.location.origin : '');
}
