-- ============================================================
-- SELLYTICS — Phase 9 Migration: Marketplace API Integrations
-- Run this in your Supabase SQL Editor
-- ============================================================

create table if not exists marketplace_integrations (
  id                uuid primary key default uuid_generate_v4(),
  platform_id       uuid references platforms(id) on delete cascade,
  platform_name     text not null unique,
  is_enabled        boolean default false,
  credentials       jsonb default '{}'::jsonb,
  status            text default 'disconnected' check (status in ('connected', 'disconnected', 'error', 'syncing')),
  last_synced_at    timestamptz,
  error_message     text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Seed default integration rows for major platforms
insert into marketplace_integrations (platform_name, status) values
  ('Amazon',   'disconnected'),
  ('Flipkart', 'disconnected'),
  ('Meesho',   'disconnected')
on conflict (platform_name) do nothing;
