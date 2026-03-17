-- Auto Audit Logs triggers for Supabase Admin tables
-- Run this script in Supabase SQL Editor (Admin project)

-- 1) Trigger function: write audit logs for INSERT/UPDATE/DELETE
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

-- 2) Attach triggers to admin configuration tables
-- Note: do not attach to audit_logs itself.

do $$
begin
  -- ad_banners
  execute 'drop trigger if exists trg_audit_ad_banners on public.ad_banners';
  execute 'create trigger trg_audit_ad_banners after insert or update or delete on public.ad_banners for each row execute function public.audit_log_write()';

  -- ad_preroll
  execute 'drop trigger if exists trg_audit_ad_preroll on public.ad_preroll';
  execute 'create trigger trg_audit_ad_preroll after insert or update or delete on public.ad_preroll for each row execute function public.audit_log_write()';

  -- homepage_sections
  execute 'drop trigger if exists trg_audit_homepage_sections on public.homepage_sections';
  execute 'create trigger trg_audit_homepage_sections after insert or update or delete on public.homepage_sections for each row execute function public.audit_log_write()';

  -- server_sources
  execute 'drop trigger if exists trg_audit_server_sources on public.server_sources';
  execute 'create trigger trg_audit_server_sources after insert or update or delete on public.server_sources for each row execute function public.audit_log_write()';

  -- site_settings
  execute 'drop trigger if exists trg_audit_site_settings on public.site_settings';
  execute 'create trigger trg_audit_site_settings after insert or update or delete on public.site_settings for each row execute function public.audit_log_write()';

  -- static_pages
  execute 'drop trigger if exists trg_audit_static_pages on public.static_pages';
  execute 'create trigger trg_audit_static_pages after insert or update or delete on public.static_pages for each row execute function public.audit_log_write()';

  -- donate_settings
  execute 'drop trigger if exists trg_audit_donate_settings on public.donate_settings';
  execute 'create trigger trg_audit_donate_settings after insert or update or delete on public.donate_settings for each row execute function public.audit_log_write()';

  -- player_settings
  execute 'drop trigger if exists trg_audit_player_settings on public.player_settings';
  execute 'create trigger trg_audit_player_settings after insert or update or delete on public.player_settings for each row execute function public.audit_log_write()';
exception
  when undefined_table then
    -- If some tables do not exist in your project yet, ignore.
    null;
end;
$$;
