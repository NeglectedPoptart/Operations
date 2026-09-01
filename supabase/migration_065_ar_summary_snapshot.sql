-- Accounts Receivable: "Show Changes" needs something to compare the
-- current AR Aging sync against - a single-row snapshot of the Summary
-- card's own totals as of the last sync, replaced every time a new report
-- is synced in. Left empty until the first sync after this migration runs,
-- so that sync has nothing to compare against yet (rather than comparing
-- against a fabricated all-zero baseline).
create table if not exists ar_summary_snapshot (
  id uuid primary key default gen_random_uuid(),
  total numeric not null,
  customers integer not null,
  escalated integer not null,
  needs_contact integer not null,
  trouble_claims integer not null,
  short_total numeric not null,
  over_total numeric not null,
  captured_at timestamptz not null default now()
);

alter table ar_summary_snapshot enable row level security;

drop policy if exists "authenticated full access" on ar_summary_snapshot;
create policy "authenticated full access" on ar_summary_snapshot
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
