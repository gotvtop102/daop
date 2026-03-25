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
} from 'antd';
import { CopyOutlined, DownloadOutlined, UploadOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';

type ExportPayload = Record<string, any[]>;

type TableKey =
  | 'ad_banners'
  | 'ad_preroll'
  | 'homepage_sections'
  | 'server_sources'
  | 'site_settings'
  | 'static_pages'
  | 'donate_settings'
  | 'player_settings';

const TABLES: Array<{ key: TableKey; label: string }> = [
  { key: 'site_settings', label: 'Site settings' },
  { key: 'player_settings', label: 'Player settings' },
  { key: 'homepage_sections', label: 'Homepage sections' },
  { key: 'ad_banners', label: 'Ad banners' },
  { key: 'ad_preroll', label: 'Video ads (pre/mid/post)' },
  { key: 'server_sources', label: 'Server sources' },
  { key: 'static_pages', label: 'Static pages' },
  { key: 'donate_settings', label: 'Donate settings' },
];

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
  const [selectedTables, setSelectedTables] = useState<TableKey[]>(TABLES.map((t) => t.key));
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

create policy "Admin only" on public.ad_banners for all using (public.is_admin());
create policy "Admin only" on public.ad_preroll for all using (public.is_admin());
create policy "Admin only" on public.homepage_sections for all using (public.is_admin());
create policy "Admin only" on public.server_sources for all using (public.is_admin());
create policy "Admin only" on public.site_settings for all using (public.is_admin());
create policy "Admin only" on public.static_pages for all using (public.is_admin());
create policy "Admin only" on public.donate_settings for all using (public.is_admin());
create policy "Admin only" on public.player_settings for all using (public.is_admin());
create policy "Admin only" on public.audit_logs for all using (public.is_admin());`;

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
insert into public.static_pages (page_key, content, apk_link, testflight_link)
values
  ('gioi-thieu', '<h1>Giới thiệu</h1>', '', ''),
  ('lien-he', '<h1>Liên hệ</h1>', '', '')
on conflict (page_key) do update set
  content = excluded.content,
  apk_link = excluded.apk_link,
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

    return [
      // Admin
      { key: 'schema-admin', title: '[Admin] Tạo bảng + RLS', sql: schemaAdminSql },
      { key: 'fix-rls', title: '[Admin] Fix RLS', sql: fixRlsSql },
      { key: 'audit', title: '[Admin] Triggers Audit Logs', sql: auditTriggersSql },
      { key: 'seed-static', title: '[Admin] Seed Static Pages', sql: seedStaticPagesSql },
      { key: 'set-admin', title: '[Admin] Set user role = admin', sql: setAdminRoleSql },
      // User
      { key: 'schema-user', title: '[User] Tạo bảng + RLS', sql: schemaUserSql },
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

      const reqs = selectedTables.map(async (t: TableKey) => {
        const r = await supabase.from(t).select('*');
        if ((r as any).error) throw (r as any).error;
        payload[t] = ((r as any).data ?? []) as any[];
      });

      await Promise.all(reqs);
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

    const r: any = await supabase.from(table).upsert(list);
    if (r.error) throw r.error;
  };

  const replaceTable = async (table: TableKey, rows: any[]) => {
    const list = Array.isArray(rows) ? rows : [];
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
        message.error(e?.message || 'Import thất bại');
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
          Backup/restore nhanh dữ liệu cấu hình và copy SQL cần thiết để setup Supabase
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
                      Lưu ý: Sau khi import, nếu đây là dữ liệu dùng cho frontend thì cần chạy Build website.
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
            key: 'sql',
            label: 'SQL Toolkit',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Card bordered={false} style={{ borderRadius: 12 }}>
                  <Typography.Text type="secondary">
                    Chạy các lệnh dưới đây trong Supabase SQL Editor (đúng project: Admin/User). Nhấn Copy để dán và chạy.
                  </Typography.Text>
                  <Divider style={{ margin: '12px 0' }} />
                  <Collapse
                    items={sqlBlocks.map((b: { key: string; title: string; sql: string }) => ({
                      key: b.key,
                      label: b.title,
                      children: (
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Space wrap>
                            <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(b.sql)}>
                              Copy SQL
                            </Button>
                          </Space>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{b.sql}</pre>
                        </Space>
                      ),
                    }))}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
