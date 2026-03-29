-- Bổ sung cột `methods` cho bảng donate_settings khi DB đã tồn tại từ schema cũ
-- (thiếu cột → build export hoặc Admin lỗi / thiếu dữ liệu).
-- Chạy một lần trên project Supabase **Admin**, SQL Editor.
-- Sau khi chạy: Settings → API → **Reload schema** (hoặc đợi vài giây) nếu PostgREST vẫn cache schema cũ.

alter table public.donate_settings
  add column if not exists methods jsonb;

comment on column public.donate_settings.methods is
  'Danh sách phương thức donate (PayPal, crypto, …) — đồng bộ với public/data/config/donate.json và Admin Donate.';
