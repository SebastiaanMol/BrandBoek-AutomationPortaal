-- supabase/migrations/20260414120000_brandy_mind_suggesties.sql
alter table brandy_mind
  add column if not exists suggesties jsonb not null default '[]'::jsonb;
