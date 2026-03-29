-- Supabase Admin Project: Cấu hình website, quảng cáo, sections, donate, audit
-- Chạy trong SQL Editor của project Supabase Admin

-- Bảng quảng cáo banner
create table if not exists public.ad_banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text,
  link_url text,
  html_code text,
  position text default 'home_top',
  start_date date,
  end_date date,
  is_active boolean default true,
  priority integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bảng pre-roll (video quảng cáo)
create table if not exists public.ad_preroll (
  id uuid primary key default gen_random_uuid(),
  name text,
  video_url text,
  image_url text,
  duration integer,
  skip_after integer,
  weight integer default 0,
  roll text default 'pre',
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table public.ad_preroll
add constraint if not exists ad_preroll_roll_check
check (roll in ('pre','mid','post'));

-- Bảng homepage sections
create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  display_type text default 'grid',
  source_type text not null,
  source_value text not null,
  filter_config jsonb,
  manual_movies jsonb,
  limit_count integer default 24,
  more_link text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bảng nguồn server
create table if not exists public.server_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Bảng cài đặt chung (key-value)
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- Bảng trang tĩnh
create table if not exists public.static_pages (
  page_key text primary key,
  content text,
  apk_link text,
  apk_tv_link text,
  testflight_link text,
  updated_at timestamptz default now()
);

-- Bảng donate
-- Nếu bảng đã tạo từ schema cũ (thiếu cột methods): chạy migrate-donate-settings-add-methods.sql
create table if not exists public.donate_settings (
  id uuid primary key default gen_random_uuid(),
  target_amount numeric default 0,
  target_currency text default 'VND',
  current_amount numeric default 0,
  paypal_link text,
  methods jsonb,
  bank_info jsonb,
  crypto_addresses jsonb,
  updated_at timestamptz default now()
);

-- Bảng cài đặt player (optional)
create table if not exists public.player_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

-- Bảng audit log
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  created_at timestamptz default now()
);

-- RLS: chỉ admin (role trong JWT)
alter table public.ad_banners enable row level security;
alter table public.ad_preroll enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.server_sources enable row level security;
alter table public.site_settings enable row level security;
alter table public.static_pages enable row level security;
alter table public.donate_settings enable row level security;
alter table public.player_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Role admin nằm trong app_metadata (raw_app_meta_data)
create or replace function public.is_admin() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
drop policy if exists "Admin only" on public.ad_banners;
drop policy if exists "Admin only" on public.ad_preroll;
drop policy if exists "Admin only" on public.homepage_sections;
drop policy if exists "Admin only" on public.server_sources;
drop policy if exists "Admin only" on public.site_settings;
drop policy if exists "Admin only" on public.static_pages;
drop policy if exists "Admin only" on public.donate_settings;
drop policy if exists "Admin only" on public.player_settings;
drop policy if exists "Admin only" on public.audit_logs;
create policy "Admin only" on public.ad_banners for all using (public.is_admin());
create policy "Admin only" on public.ad_preroll for all using (public.is_admin());
create policy "Admin only" on public.homepage_sections for all using (public.is_admin());
create policy "Admin only" on public.server_sources for all using (public.is_admin());
create policy "Admin only" on public.site_settings for all using (public.is_admin());
create policy "Admin only" on public.static_pages for all using (public.is_admin());
create policy "Admin only" on public.donate_settings for all using (public.is_admin());
create policy "Admin only" on public.player_settings for all using (public.is_admin());
create policy "Admin only" on public.audit_logs for all using (public.is_admin());

-- Insert mẫu site_settings
insert into public.site_settings (key, value) values
  ('site_name', 'DAOP Phim'),
  ('google_analytics_id', ''),
  ('simple_analytics_script', ''),
  ('supabase_user_url', ''),
  ('supabase_user_anon_key', ''),
  ('player_warning_enabled', 'true'),
  ('player_warning_text', 'Cảnh báo: Phim chứa hình ảnh đường lưỡi bò phi pháp xâm phạm chủ quyền biển đảo Việt Nam.')
on conflict (key) do nothing;
