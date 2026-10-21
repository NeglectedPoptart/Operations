-- Migration 153: remember when each uploaded report was generated.
--
-- report_uploads: one row per report loaded into HOPS (starting with Accounts
-- Receivable). It keeps the date/time the report itself says it was run, so the
-- next upload can be checked against the last one (a report dated within 4 days
-- of, or older than, the previous one gets an extra "are you sure?").
--
-- Safe to re-run.

create table if not exists report_uploads (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  report_at timestamp,
  as_of date,
  run_by text,
  file_name text,
  record_count integer,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create index if not exists report_uploads_kind_idx on report_uploads (kind, uploaded_at desc);

alter table report_uploads enable row level security;

drop policy if exists "authenticated full access" on report_uploads;
create policy "authenticated full access" on report_uploads
  for all to authenticated using (true) with check (true);
