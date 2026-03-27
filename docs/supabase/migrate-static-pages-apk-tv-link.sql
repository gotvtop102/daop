-- Add missing column for Android TV APK link
-- Run in Supabase Admin project's SQL Editor

alter table public.static_pages
add column if not exists apk_tv_link text;

