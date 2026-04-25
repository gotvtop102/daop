-- Change queue (cách 3): chỉ build các phim đã chỉnh sửa trên Admin.
-- Chạy trong Supabase SQL Editor của **Movies project** (nơi có bảng public.movies).

create table if not exists public.movie_change_queue (
  movie_id text primary key,
  slug text,
  reason text,
  processed boolean not null default false,
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists movie_change_queue_processed_updated_at_idx
  on public.movie_change_queue (processed, updated_at desc);

-- Optional: nếu muốn tự động cập nhật updated_at khi upsert/update.
create or replace function public.movie_change_queue_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_movie_change_queue_touch on public.movie_change_queue;
create trigger trg_movie_change_queue_touch
before update on public.movie_change_queue
for each row execute function public.movie_change_queue_touch_updated_at();

-- RLS: service role dùng build sẽ bypass; nếu bạn muốn cho admin JWT dùng trực tiếp thì tự tạo policy phù hợp.
-- alter table public.movie_change_queue enable row level security;
