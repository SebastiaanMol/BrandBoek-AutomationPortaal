-- supabase/migrations/20260409120000_brandy_mind.sql
create table brandy_mind (
  id               uuid primary key default gen_random_uuid(),
  signalen         jsonb not null,
  samenvatting     text not null,
  prioriteiten     jsonb not null,
  automation_count int not null,
  aangemaakt_op    timestamptz not null default now()
);

alter table brandy_mind enable row level security;

create policy "Authenticated users can read brandy_mind"
  on brandy_mind
  for select
  to authenticated
  using (true);
