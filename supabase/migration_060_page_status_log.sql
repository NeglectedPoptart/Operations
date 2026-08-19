-- page_status only ever holds the CURRENT mark per page (upserted, so each
-- click overwrites the last) - there's no history of who clicked "Mark as
-- Up to Date" over time. This adds an append-only log of every click, shown
-- on the Notifications page.
create table if not exists page_status_log (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  marked_at timestamptz not null default now(),
  marked_by uuid references profiles (id) on delete set null
);

create index if not exists page_status_log_marked_at_idx on page_status_log (marked_at desc);

alter table page_status_log enable row level security;

drop policy if exists "authenticated full access" on page_status_log;
create policy "authenticated full access" on page_status_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
