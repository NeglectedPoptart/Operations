-- Meetings > Weekly Company Call > Operations Coordinator: the pasted/
-- uploaded "Orders Summary" report was purely client-side state before this
-- - only the person who ran Analyze saw the resulting charts, since nothing
-- was ever saved. Persists the raw report text as a single current
-- snapshot (report_key is always 'current' - there's only ever one, this
-- week's) so page.tsx can fetch it and everyone opening the page sees the
-- same already-analyzed report.
create table if not exists weekly_sales_orders_report (
  report_key text primary key default 'current',
  raw_text text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table weekly_sales_orders_report enable row level security;
drop policy if exists "authenticated full access" on weekly_sales_orders_report;
create policy "authenticated full access" on weekly_sales_orders_report
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
