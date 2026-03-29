import { useEffect, useMemo, useState } from 'react';
import {
  Tabs,
  Card,
  Space,
  Typography,
  Button,
  Select,
  Input,
  message,
  Modal,
  Divider,
  Collapse,
  Alert,
} from 'antd';
import { CopyOutlined, DownloadOutlined, UploadOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/api';
import { normalizeCommentsAdminSecret } from '../lib/commentAdminSecret';

type ExportPayload = Record<string, any[]>;

type TableKey =
  | 'ad_banners'
  | 'ad_preroll'
  | 'homepage_sections'
  | 'server_sources'
  | 'site_settings'
  | 'static_pages'
  | 'donate_settings'
  | 'player_settings'
  | 'movies'
  | 'movie_episodes';

const TABLES: Array<{ key: TableKey; label: string }> = [
  { key: 'site_settings', label: 'Site settings' },
  { key: 'player_settings', label: 'Player settings' },
  { key: 'homepage_sections', label: 'Homepage sections' },
  { key: 'ad_banners', label: 'Ad banners' },
  { key: 'ad_preroll', label: 'Video ads (pre/mid/post)' },
  { key: 'server_sources', label: 'Server sources' },
  { key: 'static_pages', label: 'Static pages' },
  { key: 'donate_settings', label: 'Donate settings' },
  { key: 'movies', label: 'Movies (phim — Admin/API)' },
  { key: 'movie_episodes', label: 'Movie episodes (tập)' },
];

/** Mặc định không chọn phim/tập (có thể rất lớn); bật tay khi cần backup. */
const DEFAULT_SELECTED_TABLES: TableKey[] = TABLES.filter(
  (t) => t.key !== 'movies' && t.key !== 'movie_episodes'
).map((t) => t.key);

/** Phim/tập: RLS + anon có thể trả [] dù DB có dữ liệu — export qua /api/movies (service role) giống trang Danh sách phim. */
const MOVIE_EXPORT_TABLES: TableKey[] = ['movies', 'movie_episodes'];

async function selectAllRowsForExport(table: TableKey): Promise<any[]> {
  const r = await supabase.from(table).select('*');
  if (r.error) throw r.error;
  return (r.data ?? []) as any[];
}

function downloadJson(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success('Đã copy');
  } catch {
    message.error('Copy thất bại');
  }
}

export default function SupabaseTools() {
  const [selectedTables, setSelectedTables] = useState<TableKey[]>(DEFAULT_SELECTED_TABLES);
  const [exporting, setExporting] = useState(false);

  const [importMode, setImportMode] = useState<'upsert' | 'replace'>('upsert');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const USER_TABLES = useMemo(
    () => [
      { key: 'favorites', label: 'favorites' },
      { key: 'watch_history', label: 'watch_history' },
      { key: 'profiles', label: 'profiles' },
      { key: 'user_changes', label: 'user_changes' },
    ],
    []
  );
  const [selectedUserTables, setSelectedUserTables] = useState<string[]>(USER_TABLES.map((t) => t.key));
  const [userExporting, setUserExporting] = useState(false);
  const [userImportMode, setUserImportMode] = useState<'upsert' | 'replace'>('upsert');
  const [userImportText, setUserImportText] = useState('');
  const [userImporting, setUserImporting] = useState(false);

  const COMMENT_SITE_LS = 'daop_comment_site_base';
  const [commentSiteBase, setCommentSiteBase] = useState('');
  const [commentAdminSecret, setCommentAdminSecret] = useState('');
  const [commentImportText, setCommentImportText] = useState('');
  const [commentImportMode, setCommentImportMode] = useState<'merge' | 'replace'>('merge');
  const [commentExporting, setCommentExporting] = useState(false);
  const [commentImporting, setCommentImporting] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(COMMENT_SITE_LS);
      if (v) setCommentSiteBase(v);
    } catch {
      /* ignore */
    }
  }, []);

  const persistCommentSiteBase = (v: string) => {
    setCommentSiteBase(v);
    try {
      localStorage.setItem(COMMENT_SITE_LS, v);
    } catch {
      /* ignore */
    }
  };

  const commentPagesBaseUrl = () => {
    const raw = (commentSiteBase || '').trim().replace(/\/$/, '');
    if (!raw) return '';
    return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  };

  /** Gửi cả X- header và Bearer — một số môi trường có thể chặn một trong hai. */
  const commentD1AuthHeaders = (secret: string) => ({
    'X-Comments-Admin-Secret': secret,
    Authorization: `Bearer ${secret}`,
  });

  const exportCommentsD1 = async () => {
    const base = commentPagesBaseUrl();
    const secret = normalizeCommentsAdminSecret(commentAdminSecret);
    if (!base) {
      message.warning('Nhập URL website tĩnh (Cloudflare Pages), ví dụ https://ten.pages.dev');
      return;
    }
    if (secret.length < 8) {
      message.warning('Nhập COMMENTS_ADMIN_SECRET (trùng Secret trên Pages, tối thiểu 8 ký tự; khuyến nghị 16+)');
      return;
    }
    setCommentExporting(true);
    try {
      const res = await fetch(`${base}/api/comment/admin-export`, {
        headers: commentD1AuthHeaders(secret),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      downloadJson(`comments-d1-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, data);
      message.success('Đã export comment từ D1');
    } catch (e: any) {
      message.error(e?.message || 'Export thất bại');
    } finally {
      setCommentExporting(false);
    }
  };

  const runImportCommentsD1 = async () => {
    let parsed: any = null;
    try {
      parsed = JSON.parse(commentImportText || '');
    } catch {
      message.error('JSON không hợp lệ');
      return;
    }
    const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    const comment_reactions = Array.isArray(parsed.comment_reactions) ? parsed.comment_reactions : [];
    if (!comments.length && !comment_reactions.length) {
      message.warning('JSON cần có mảng comments và/hoặc comment_reactions (format từ export)');
      return;
    }
    const base = commentPagesBaseUrl();
    const secret = normalizeCommentsAdminSecret(commentAdminSecret);
    if (!base) {
      message.warning('Nhập URL website');
      return;
    }
    if (secret.length < 8) {
      message.warning('Nhập COMMENTS_ADMIN_SECRET (tối thiểu 8 ký tự; khuyến nghị 16+)');
      return;
    }
    setCommentImporting(true);
    try {
      const res = await fetch(`${base}/api/comment/admin-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...commentD1AuthHeaders(secret),
        },
        body: JSON.stringify({
          mode: commentImportMode,
          comments,
          comment_reactions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      message.success(
        `Import xong: ${data.commentsUpserted ?? 0} comment, ${data.reactionsProcessed ?? 0} reaction`
      );
    } catch (e: any) {
      message.error(e?.message || 'Import thất bại');
    } finally {
      setCommentImporting(false);
    }
  };

  const importCommentsD1 = async () => {
    if (commentImportMode === 'replace') {
      Modal.confirm({
        title: 'Replace sẽ xóa toàn bộ comment + reaction trong D1 rồi ghi lại',
        okText: 'Tiếp tục',
        okButtonProps: { danger: true },
        cancelText: 'Hủy',
        onOk: runImportCommentsD1,
      });
      return;
    }
    await runImportCommentsD1();
  };

  const exportUserTables = async () => {
    try {
      if (!selectedUserTables.length) {
        message.warning('Chọn ít nhất 1 bảng để export');
        return;
      }
      setUserExporting(true);
      const r = await fetch('/api/supabase-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export', tables: selectedUserTables }),
      }).then((x) => x.json());
      if (!r?.ok) throw new Error(r?.message || 'Export thất bại');
      const payload = r?.data;
      downloadJson(
        `supabase-user-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
        payload
      );
      message.success('Đã export JSON');
    } catch (e: any) {
      message.error(e?.message || 'Export thất bại');
    } finally {
      setUserExporting(false);
    }
  };

  const importUserTables = async () => {
    let parsed: any = null;
    try {
      parsed = JSON.parse(userImportText || '');
    } catch {
      message.error('JSON không hợp lệ');
      return;
    }
    if (!selectedUserTables.length) {
      message.warning('Chọn ít nhất 1 bảng để import');
      return;
    }

    const run = async () => {
      setUserImporting(true);
      try {
        const r = await fetch('/api/supabase-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import',
            mode: userImportMode,
            tables: selectedUserTables,
            data: parsed,
          }),
        }).then((x) => x.json());
        if (!r?.ok) throw new Error(r?.message || 'Import thất bại');
        message.success('Import thành công');
      } catch (e: any) {
        message.error(e?.message || 'Import thất bại');
      } finally {
        setUserImporting(false);
      }
    };

    if (userImportMode === 'replace') {
      Modal.confirm({
        title: 'Replace sẽ xóa dữ liệu hiện tại rồi nhập lại. Bạn chắc chắn?',
        content: 'Hãy chắc chắn bạn đang import đúng JSON. Thao tác này không thể hoàn tác.',
        okText: 'Tiếp tục',
        okButtonProps: { danger: true },
        cancelText: 'Hủy',
        onOk: run,
      });
      return;
    }

    await run();
  };

  const sqlBlocks = useMemo(() => {
    const schemaUserSql = `-- Supabase User Project: Auth + dữ liệu người dùng (favorites, watch history)
-- Chạy trong SQL Editor của project Supabase User

-- Bảng profiles (mở rộng auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Bảng favorites
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references auth.users(id) on delete cascade,
  movie_slug text not null,
  created_at timestamptz default now(),
  unique(user_uid, movie_slug)
);

-- Bảng watch_history
create table if not exists public.watch_history (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references auth.users(id) on delete cascade,
  movie_slug text not null,
  episode text,
  timestamp integer default 0,
  last_watched timestamptz default now(),
  unique(user_uid, movie_slug)
);

-- Bảng user_changes (đồng bộ delta)
create table if not exists public.user_changes (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references auth.users(id) on delete cascade,
  change_type text not null,
  item_key text not null,
  new_value jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.watch_history enable row level security;
alter table public.user_changes enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Users can manage own favorites" on public.favorites for all using (auth.uid() = user_uid);
create policy "Users can manage own watch_history" on public.watch_history for all using (auth.uid() = user_uid);
create policy "Users can read own user_changes" on public.user_changes for select using (auth.uid() = user_uid);

-- Trigger tạo profile khi đăng ký
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();`;

    const schemaAdminSql = `-- Supabase Admin Project: Cấu hình website, quảng cáo, sections, donate, audit
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

-- ================================
-- VIP ACCESS STATE (admin_access_state)
-- ================================
-- Lưu quyền đã active theo user đang đăng nhập.
create table if not exists public.admin_access_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  vip_key_id uuid null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_access_state_updated_at on public.admin_access_state;
create trigger trg_admin_access_state_updated_at
before update on public.admin_access_state
for each row execute function public.set_updated_at();

alter table public.admin_access_state enable row level security;

grant select, insert, update on public.admin_access_state to authenticated;

drop policy if exists admin_access_state_select_own on public.admin_access_state;
create policy admin_access_state_select_own
on public.admin_access_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists admin_access_state_insert_own on public.admin_access_state;
create policy admin_access_state_insert_own
on public.admin_access_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists admin_access_state_update_own on public.admin_access_state;
create policy admin_access_state_update_own
on public.admin_access_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);`;

    const fixRlsSql = `-- Sửa RLS: role admin nằm trong app_metadata của JWT (từ raw_app_meta_data)
-- Chạy trong SQL Editor của project Supabase Admin nếu Admin đăng nhập được nhưng không đọc/ghi được dữ liệu

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
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
drop policy if exists "Admin only" on public.movies;
drop policy if exists "Admin only" on public.movie_episodes;

create policy "Admin only" on public.ad_banners for all using (public.is_admin());
create policy "Admin only" on public.ad_preroll for all using (public.is_admin());
create policy "Admin only" on public.homepage_sections for all using (public.is_admin());
create policy "Admin only" on public.server_sources for all using (public.is_admin());
create policy "Admin only" on public.site_settings for all using (public.is_admin());
create policy "Admin only" on public.static_pages for all using (public.is_admin());
create policy "Admin only" on public.donate_settings for all using (public.is_admin());
create policy "Admin only" on public.player_settings for all using (public.is_admin());
create policy "Admin only" on public.audit_logs for all using (public.is_admin());
create policy "Admin only" on public.movies for all using (public.is_admin());
create policy "Admin only" on public.movie_episodes for all using (public.is_admin());`;

    const auditTriggersSql = `-- Auto Audit Logs triggers for Supabase Admin tables
-- Run this script in Supabase SQL Editor (Admin project)

create or replace function public.audit_log_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_old jsonb;
  v_new jsonb;
  v_ip inet;
begin
  v_user_id := auth.uid();
  v_action := tg_op;
  v_entity_type := tg_table_name;

  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  v_entity_id := coalesce(
    (v_new ->> 'id'),
    (v_old ->> 'id'),
    (v_new ->> 'key'),
    (v_old ->> 'key'),
    (v_new ->> 'page_key'),
    (v_old ->> 'page_key'),
    (v_new ->> 'slug'),
    (v_old ->> 'slug')
  );

  begin
    v_ip := inet_client_addr();
  exception when others then
    v_ip := null;
  end;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    ip_address
  ) values (
    v_user_id,
    v_action,
    v_entity_type,
    v_entity_id,
    v_old,
    v_new,
    v_ip
  );

  return coalesce(new, old);
end;
$$;

do $$
begin
  execute 'drop trigger if exists trg_audit_ad_banners on public.ad_banners';
  execute 'create trigger trg_audit_ad_banners after insert or update or delete on public.ad_banners for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_ad_preroll on public.ad_preroll';
  execute 'create trigger trg_audit_ad_preroll after insert or update or delete on public.ad_preroll for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_homepage_sections on public.homepage_sections';
  execute 'create trigger trg_audit_homepage_sections after insert or update or delete on public.homepage_sections for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_server_sources on public.server_sources';
  execute 'create trigger trg_audit_server_sources after insert or update or delete on public.server_sources for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_site_settings on public.site_settings';
  execute 'create trigger trg_audit_site_settings after insert or update or delete on public.site_settings for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_static_pages on public.static_pages';
  execute 'create trigger trg_audit_static_pages after insert or update or delete on public.static_pages for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_donate_settings on public.donate_settings';
  execute 'create trigger trg_audit_donate_settings after insert or update or delete on public.donate_settings for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_player_settings on public.player_settings';
  execute 'create trigger trg_audit_player_settings after insert or update or delete on public.player_settings for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_movies on public.movies';
  execute 'create trigger trg_audit_movies after insert or update or delete on public.movies for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_movie_episodes on public.movie_episodes';
  execute 'create trigger trg_audit_movie_episodes after insert or update or delete on public.movie_episodes for each row execute function public.audit_log_write()';

  execute 'drop trigger if exists trg_audit_admin_access_state on public.admin_access_state';
  execute 'create trigger trg_audit_admin_access_state after insert or update or delete on public.admin_access_state for each row execute function public.audit_log_write()';
exception
  when undefined_table then
    null;
end;
$$;`;

    const seedStaticPagesSql = `-- Seed Static Pages (chạy trong Supabase Admin project)
-- Tùy chọn: chạy sau khi tạo bảng static_pages

-- Ví dụ insert/update một số page_key cơ bản
insert into public.static_pages (page_key, content, apk_link, apk_tv_link, testflight_link)
values
  ('gioi-thieu', '<h1>Giới thiệu</h1>', '', '', ''),
  ('lien-he', '<h1>Liên hệ</h1>', '', '', '')
on conflict (page_key) do update set
  content = excluded.content,
  apk_link = excluded.apk_link,
  apk_tv_link = excluded.apk_tv_link,
  testflight_link = excluded.testflight_link,
  updated_at = now();`;

    const setAdminRoleSql = `-- Set user role = admin (chạy trong Supabase SQL Editor)
-- 1) Tạo user bằng Auth UI hoặc Invite trước
-- 2) Thay email bên dưới

update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"',
  true
)
where email = 'admin@example.com';`;

    const moviesSchemaSql = `-- Bảng phim + tập — đồng bộ với docs/supabase/schema-movies-episodes.sql
-- Chạy sau schema-admin.sql (cần public.is_admin()).

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

drop policy if exists "Admin only" on public.movies;
create policy "Admin only" on public.movies for all using (public.is_admin());

drop policy if exists "Admin only" on public.movie_episodes;
create policy "Admin only" on public.movie_episodes for all using (public.is_admin());

insert into public.site_settings (key, value)
values ('movies_data_source', 'supabase')
on conflict (key) do nothing;`;

    const migrateDonateMethodsSql = `-- Bổ sung cột methods cho donate_settings (DB tạo từ schema cũ, thiếu cột)
-- Chạy trong SQL Editor — project Supabase Admin. Repo: docs/supabase/migrate-donate-settings-add-methods.sql
-- Sau khi chạy: Settings → API → Reload schema nếu PostgREST cache schema cũ.

alter table public.donate_settings
  add column if not exists methods jsonb;

comment on column public.donate_settings.methods is
  'Danh sách phương thức donate (PayPal, crypto, …) — đồng bộ donate.json và trang Quản lý Donate.';

`;

    const adminInstallSql = [
      '-- =============================================================================',
      '-- [Admin] Khởi tạo đầy đủ — chạy một lần trên project Supabase Admin (theo thứ tự các phần)',
      '-- =============================================================================',
      '',
      '-- ----- Phần A: Bảng cấu hình site, quảng cáo, donate, RLS, VIP access, ... -----',
      schemaAdminSql,
      '',
      '-- ----- Phần B: Bảng movies + movie_episodes (phụ thuộc is_admin trong Phần A) -----',
      moviesSchemaSql,
      '',
      '-- ----- Phần C: Triggers ghi audit_logs -----',
      auditTriggersSql,
      '',
      '-- ----- Phần D: Seed trang tĩnh mẫu (tùy chọn) -----',
      seedStaticPagesSql,
    ].join('\n');

    const adminMaintenanceSql = [
      '-- =============================================================================',
      '-- [Admin] Bảo trì — chỉ chạy khi cần (DB cũ hoặc lỗi quyền)',
      '-- =============================================================================',
      '',
      '-- ----- Migration: DB cũ thiếu cột methods trên donate_settings -----',
      migrateDonateMethodsSql.trim(),
      '',
      '-- ----- Sửa RLS: đăng nhập Admin được nhưng không đọc/ghi bảng -----',
      fixRlsSql.trim(),
    ].join('\n');

    const userInstallSql = [
      '-- =============================================================================',
      '-- [User] Khởi tạo project Supabase User — bảng người dùng + gán admin',
      '-- =============================================================================',
      '',
      '-- ----- Phần A: profiles, favorites, watch_history, user_changes + RLS -----',
      schemaUserSql,
      '',
      '-- ----- Phần B: Gán role admin (đổi email, tạo user trong Auth trước) -----',
      setAdminRoleSql.trim(),
    ].join('\n');

    return [
      { key: 'admin-install', title: '[Admin] Khởi tạo database (bảng, RLS, phim/tập, audit, seed)', sql: adminInstallSql },
      { key: 'admin-maint', title: '[Admin] Migration & sửa RLS (DB cũ / lỗi quyền)', sql: adminMaintenanceSql },
      { key: 'user-install', title: '[User] Tạo bảng, RLS và gán role admin', sql: userInstallSql },
    ];
  }, []);

  const handleExport = async () => {
    try {
      if (!selectedTables.length) {
        message.warning('Chọn ít nhất 1 bảng để export');
        return;
      }
      setExporting(true);
      const payload: ExportPayload = {};

      const viaApi = selectedTables.filter((t) => MOVIE_EXPORT_TABLES.includes(t));
      const viaSb = selectedTables.filter((t) => !MOVIE_EXPORT_TABLES.includes(t));

      if (viaApi.length) {
        const base = getApiBaseUrl().replace(/\/$/, '');
        if (!base) throw new Error('Thiếu URL gọi API (dev: proxy /api; production: VITE_API_URL hoặc cùng host với deploy API).');
        const res = await fetch(`${base}/api/movies?action=exportFull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tables: viaApi }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: Record<string, any[]> };
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        if (!j?.ok) throw new Error(j?.error || 'Export phim/tập thất bại');
        const data = j.data || {};
        for (const t of viaApi) {
          payload[t] = Array.isArray(data[t]) ? data[t] : [];
        }
      }

      await Promise.all(
        viaSb.map(async (t: TableKey) => {
          payload[t] = await selectAllRowsForExport(t);
        })
      );
      payload.__meta = [
        {
          exported_at: new Date().toISOString(),
          tables: selectedTables,
        },
      ];

      downloadJson(`supabase-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, payload);
      message.success('Đã export JSON');
    } catch (e: any) {
      message.error(e?.message || 'Export thất bại');
    } finally {
      setExporting(false);
    }
  };

  const upsertTable = async (table: TableKey, rows: any[]) => {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return;

    if (table === 'site_settings') {
      const r: any = await supabase.from(table).upsert(list, { onConflict: 'key' });
      if (r.error) throw r.error;
      return;
    }

    if (table === 'static_pages') {
      const r: any = await supabase.from(table).upsert(list, { onConflict: 'page_key' });
      if (r.error) throw r.error;
      return;
    }

    if (table === 'player_settings') {
      const r: any = await supabase.from(table).upsert(list, { onConflict: 'key' });
      if (r.error) throw r.error;
      return;
    }

    if (table === 'server_sources') {
      const r: any = await supabase.from(table).upsert(list, { onConflict: 'slug' });
      if (r.error) throw r.error;
      return;
    }

    if (table === 'movies') {
      const r: any = await supabase.from(table).upsert(list, { onConflict: 'id' });
      if (r.error) throw r.error;
      return;
    }

    if (table === 'movie_episodes') {
      const r: any = await supabase.from(table).upsert(list, { onConflict: 'id' });
      if (r.error) throw r.error;
      return;
    }

    const r: any = await supabase.from(table).upsert(list);
    if (r.error) throw r.error;
  };

  const replaceTable = async (table: TableKey, rows: any[]) => {
    const list = Array.isArray(rows) ? rows : [];

    if (table === 'movies') {
      const del: any = await supabase.from('movies').delete().not('id', 'is', null);
      if (del.error) throw del.error;
      if (list.length) {
        const ins: any = await supabase.from('movies').insert(list);
        if (ins.error) throw ins.error;
      }
      return;
    }

    if (table === 'movie_episodes') {
      const del: any = await supabase
        .from('movie_episodes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (del.error) throw del.error;
      if (list.length) {
        const ins: any = await supabase.from('movie_episodes').insert(list);
        if (ins.error) throw ins.error;
      }
      return;
    }

    const del: any = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del.error) {
      const del2: any = await supabase.from(table).delete().gte('created_at', '1970-01-01T00:00:00.000Z');
      if (del2.error) {
        const del3: any = await supabase.from(table).delete().not('key', 'is', null);
        if (del3.error) {
          const del4: any = await supabase.from(table).delete().not('page_key', 'is', null);
          if (del4.error) throw del4.error;
        }
      }
    }

    if (list.length) {
      const ins: any = await supabase.from(table).insert(list);
      if (ins.error) throw ins.error;
    }
  };

  const handleImport = async () => {
    let parsed: any = null;
    try {
      parsed = JSON.parse(importText || '');
    } catch {
      message.error('JSON không hợp lệ');
      return;
    }

    const tablesInJson = TABLES.map((t) => t.key).filter((k) => parsed && Object.prototype.hasOwnProperty.call(parsed, k));
    if (!tablesInJson.length) {
      message.warning('Không tìm thấy bảng hợp lệ trong JSON');
      return;
    }

    const run = async () => {
      setImporting(true);
      try {
        for (const t of tablesInJson) {
          const rows = Array.isArray(parsed[t]) ? parsed[t] : [];
          if (importMode === 'replace') {
            await replaceTable(t, rows);
          } else {
            await upsertTable(t, rows);
          }
        }
        message.success('Import thành công');
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (
          msg.includes('methods') &&
          (msg.includes('does not exist') || msg.includes('schema cache'))
        ) {
          message.error(
            'Import thất bại: DB thiếu cột methods trên donate_settings. Tab SQL Toolkit → «[Admin] Migration & sửa RLS», copy phần migration donate_settings rồi chạy trên Supabase Admin, sau đó import lại.',
            10
          );
        } else {
          message.error(msg || 'Import thất bại');
        }
      } finally {
        setImporting(false);
      }
    };

    if (importMode === 'replace') {
      Modal.confirm({
        title: 'Replace sẽ xóa dữ liệu hiện tại rồi nhập lại. Bạn chắc chắn?',
        content: 'Hãy chắc chắn bạn đang import đúng JSON. Thao tác này không thể hoàn tác.',
        okText: 'Tiếp tục',
        okButtonProps: { danger: true },
        cancelText: 'Hủy',
        onOk: run,
      });
      return;
    }

    await run();
  };

  return (
    <>
      <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 12 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Supabase Tools
        </Typography.Title>
        <Typography.Text type="secondary">
          Backup/restore dữ liệu cấu hình + phim (movies / movie_episodes), và copy SQL setup. Phim/tập được lấy qua{' '}
          <Typography.Text code>/api/movies?action=exportFull</Typography.Text> (service role, không phụ thuộc RLS trình duyệt).
          Dev: cần <Typography.Text code>VITE_API_URL</Typography.Text> trong admin để proxy <Typography.Text code>/api</Typography.Text>{' '}
          tới Vercel. Export phim/tập mặc định <strong>không chọn</strong> — bật tay khi cần (file có thể rất lớn).
        </Typography.Text>
      </Space>

      <Tabs
        items={[
          {
            key: 'data',
            label: 'Xuất / Nhập dữ liệu',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Card title="Xuất dữ liệu (JSON)" bordered={false} style={{ borderRadius: 12 }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <div>
                      <Typography.Text strong>Chọn bảng</Typography.Text>
                      <div style={{ marginTop: 8 }}>
                        <Select
                          mode="multiple"
                          value={selectedTables}
                          onChange={(v: unknown) => setSelectedTables(v as TableKey[])}
                          options={TABLES.map((t) => ({ value: t.key, label: t.label }))}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <Space wrap>
                      <Button
                        icon={<DownloadOutlined />}
                        type="primary"
                        onClick={handleExport}
                        loading={exporting}
                      >
                        Export JSON
                      </Button>
                      <Button onClick={() => setSelectedTables(TABLES.map((t) => t.key))}>Chọn tất cả</Button>
                      <Button onClick={() => setSelectedTables([])}>Bỏ chọn</Button>
                    </Space>
                  </Space>
                </Card>

                <Card title="Nhập dữ liệu (JSON)" bordered={false} style={{ borderRadius: 12 }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <Space wrap>
                      <Typography.Text strong>Chế độ import</Typography.Text>
                      <Select
                        value={importMode}
                        onChange={(v: 'upsert' | 'replace') => setImportMode(v)}
                        options={[
                          { value: 'upsert', label: 'Upsert (khuyến nghị)' },
                          { value: 'replace', label: 'Replace (nguy hiểm)' },
                        ]}
                        style={{ width: 220 }}
                      />
                    </Space>

                    <Input.TextArea
                      rows={10}
                      value={importText}
                      onChange={(e: any) => setImportText(e.target.value)}
                      placeholder="Dán JSON export vào đây..."
                    />

                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={handleImport}
                        loading={importing}
                      >
                        Import
                      </Button>
                      <Button onClick={() => setImportText('')}>Xóa nội dung</Button>
                    </Space>

                    <Typography.Text type="secondary">
                      Lưu ý: Sau khi import cấu hình / phim, chạy Build website để cập nhật site. Replace trên phim/tập là thao tác mạnh — nên có bản export trước.
                    </Typography.Text>
                  </Space>
                </Card>
              </Space>
            ),
          },
          {
            key: 'user-config',
            label: 'Supabase User',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Card title="Xuất / Nhập dữ liệu (Supabase User project)" bordered={false} style={{ borderRadius: 12 }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <div>
                      <Typography.Text strong>Chọn bảng</Typography.Text>
                      <div style={{ marginTop: 8 }}>
                        <Select
                          mode="multiple"
                          value={selectedUserTables}
                          onChange={(v: unknown) => setSelectedUserTables(v as string[])}
                          options={USER_TABLES.map((t) => ({ value: t.key, label: t.label }))}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>

                    <Space wrap>
                      <Button icon={<DownloadOutlined />} type="primary" onClick={exportUserTables} loading={userExporting}>
                        Export JSON
                      </Button>
                      <Button onClick={() => setSelectedUserTables(USER_TABLES.map((t) => t.key))}>Chọn tất cả</Button>
                      <Button onClick={() => setSelectedUserTables([])}>Bỏ chọn</Button>
                    </Space>

                    <Divider style={{ margin: '8px 0' }} />

                    <Space wrap>
                      <Typography.Text strong>Chế độ import</Typography.Text>
                      <Select
                        value={userImportMode}
                        onChange={(v: 'upsert' | 'replace') => setUserImportMode(v)}
                        options={[
                          { value: 'upsert', label: 'Upsert (khuyến nghị)' },
                          { value: 'replace', label: 'Replace (nguy hiểm)' },
                        ]}
                        style={{ width: 220 }}
                      />
                    </Space>

                    <Input.TextArea
                      rows={10}
                      value={userImportText}
                      onChange={(e: any) => setUserImportText(e.target.value)}
                      placeholder="Dán JSON export (các key: profiles/favorites/watch_history/user_changes) vào đây..."
                    />

                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={importUserTables}
                        loading={userImporting}
                      >
                        Import
                      </Button>
                      <Button onClick={() => setUserImportText('')}>Xóa nội dung</Button>
                      <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(userImportText || '')}>
                        Copy JSON đang dán
                      </Button>
                    </Space>

                    <Typography.Text type="secondary">
                      Lưu ý: Mặc định thao tác qua API server-side để tránh RLS chặn khi dùng anon key.
                    </Typography.Text>
                  </Space>
                </Card>
              </Space>
            ),
          },
          {
            key: 'comments-d1',
            label: 'Comment (D1)',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="Bình luận lưu trên Cloudflare D1 (Pages Functions), không nằm trong Supabase."
                  description={
                    <span>
                      Nếu project dùng <Typography.Text code>wrangler.toml</Typography.Text>, biến plaintext thường
                      không thêm được trên Dashboard — chỉ thêm{' '}
                      <Typography.Text code>COMMENTS_ADMIN_SECRET</Typography.Text> dạng{' '}
                      <strong>Secret (mã hóa)</strong>: Pages → Settings → Variables and Secrets →{' '}
                      <strong>Add</strong> → bật <strong>Encrypt</strong> / chọn loại Secret; hoặc CLI:{' '}
                      <Typography.Text code>
                        npx wrangler pages secret put COMMENTS_ADMIN_SECRET --project-name=TÊN_PROJECT
                      </Typography.Text>
                      . Giá trị: chuỗi ngẫu nhiên ≥32 ký tự. Sau đó deploy lại. API:{' '}
                      <Typography.Text code>/api/comment/admin-export</Typography.Text>,{' '}
                      <Typography.Text code>/api/comment/admin-import</Typography.Text>.
                    </span>
                  }
                />
                <Card title="Kết nối" bordered={false} style={{ borderRadius: 12 }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <div>
                      <Typography.Text strong>URL website (Pages)</Typography.Text>
                      <Input
                        style={{ marginTop: 8 }}
                        placeholder="https://ten-project.pages.dev"
                        value={commentSiteBase}
                        onChange={(e) => persistCommentSiteBase(e.target.value)}
                      />
                      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                        Lưu trong trình duyệt (localStorage). Phải là site đã bật comment + D1.
                      </Typography.Text>
                    </div>
                    <div>
                      <Typography.Text strong>COMMENTS_ADMIN_SECRET</Typography.Text>
                      <Input.Password
                        style={{ marginTop: 8 }}
                        placeholder="Cùng giá trị đã đặt trên Cloudflare Pages"
                        value={commentAdminSecret}
                        onChange={(e) => setCommentAdminSecret(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </Space>
                </Card>
                <Card title="Export" bordered={false} style={{ borderRadius: 12 }}>
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={exportCommentsD1}
                      loading={commentExporting}
                    >
                      Tải JSON (comments + comment_reactions)
                    </Button>
                  </Space>
                </Card>
                <Card title="Import" bordered={false} style={{ borderRadius: 12 }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <Space wrap>
                      <Typography.Text strong>Chế độ</Typography.Text>
                      <Select
                        value={commentImportMode}
                        onChange={(v: 'merge' | 'replace') => setCommentImportMode(v)}
                        options={[
                          { value: 'merge', label: 'Merge / upsert theo id (khuyến nghị)' },
                          { value: 'replace', label: 'Replace — xóa hết D1 rồi ghi lại' },
                        ]}
                        style={{ width: 320 }}
                      />
                    </Space>
                    <Input.TextArea
                      rows={12}
                      value={commentImportText}
                      onChange={(e: any) => setCommentImportText(e.target.value)}
                      placeholder='Dán JSON từ export (có "comments" và "comment_reactions")...'
                    />
                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={importCommentsD1}
                        loading={commentImporting}
                      >
                        Import
                      </Button>
                      <Button onClick={() => setCommentImportText('')}>Xóa nội dung</Button>
                      <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(commentImportText || '')}>
                        Copy JSON
                      </Button>
                    </Space>
                  </Space>
                </Card>
              </Space>
            ),
          },
          {
            key: 'sql',
            label: 'SQL Toolkit',
            children: (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Chạy trong Supabase SQL Editor (đúng project Admin/User). Mở từng mục để xem SQL; Copy nằm trên dòng tiêu đề.
                </Typography.Text>
                <Collapse
                  size="small"
                  ghost
                  defaultActiveKey={[]}
                  items={sqlBlocks.map((b: { key: string; title: string; sql: string }) => ({
                    key: b.key,
                    label: <span style={{ fontSize: 13 }}>{b.title}</span>,
                    extra: (
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(b.sql);
                        }}
                      >
                        Copy
                      </Button>
                    ),
                    children: (
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          maxHeight: 'min(50vh, 480px)',
                          overflow: 'auto',
                          fontSize: 12,
                          lineHeight: 1.45,
                        }}
                      >
                        {b.sql}
                      </pre>
                    ),
                  }))}
                />
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
