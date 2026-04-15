-- supabase/migrations/20260415120000_portal_settings.sql
create table if not exists portal_settings (
  id          text primary key default 'main',
  settings    jsonb not null default '{}',
  updated_at  timestamptz default now()
);

alter table portal_settings enable row level security;

create policy "portal_settings_read"
  on portal_settings for select using (true);

create policy "portal_settings_write"
  on portal_settings for all using (auth.role() = 'authenticated');
