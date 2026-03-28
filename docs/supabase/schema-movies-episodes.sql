-- Bảng phim + tập (thay thế tab Google Sheets movies / episodes) — chạy trong SQL Editor project Supabase Admin
-- Yêu cầu đã chạy schema-admin.sql (bảng site_settings). Build script (scripts/build.js) đọc phim tùy chỉnh từ Supabase hoặc custom_movies.xlsx.
-- API Vercel dùng SUPABASE_ADMIN_SERVICE_ROLE_KEY (bypass RLS). Không expose dữ liệu này cho anon nếu không có policy.

create table if not exists public.movies (
  id text primary key,
  slug text,
  title text,
  name text,
  origin_name text,
  type text,
  year text,
  genre text,
  country text,
  language text,
  quality text,
  episode_current text,
  thumb_url text,
  poster_url text,
  description text,
  content text,
  status text,
  chieurap text,
  showtimes text,
  is_exclusive text,
  tmdb_id text,
  modified text,
  "update" text,
  note text,
  director text,
  actor text,
  tmdb_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists movies_slug_idx on public.movies (slug);
create index if not exists movies_type_idx on public.movies (type);
create index if not exists movies_update_flag_idx on public.movies ("update");

create table if not exists public.movie_episodes (
  id uuid primary key default gen_random_uuid(),
  movie_id text not null references public.movies(id) on delete cascade,
  episode_code text,
  episode_name text,
  server_slug text,
  server_name text,
  link_m3u8 text,
  link_embed text,
  link_backup text,
  link_vip1 text,
  link_vip2 text,
  link_vip3 text,
  link_vip4 text,
  link_vip5 text,
  note text,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists movie_episodes_movie_id_idx on public.movie_episodes (movie_id);

-- Danh sách slug trùng (dùng cho tab Trùng lặp trong Admin) — phải tạo sau bảng movies
create or replace function public.movies_duplicate_slugs()
returns table (slug text)
language sql
stable
as $$
  select m.slug::text
  from public.movies m
  where m.slug is not null and trim(m.slug) <> ''
  group by m.slug
  having count(*) > 1;
$$;

alter table public.movies enable row level security;
alter table public.movie_episodes enable row level security;

-- Admin Panel + Supabase Tools (JWT role = admin; hàm is_admin() trong schema-admin.sql)
drop policy if exists "Admin only" on public.movies;
create policy "Admin only" on public.movies for all using (public.is_admin());

drop policy if exists "Admin only" on public.movie_episodes;
create policy "Admin only" on public.movie_episodes for all using (public.is_admin());

insert into public.site_settings (key, value)
values ('movies_data_source', 'supabase')
on conflict (key) do nothing;
