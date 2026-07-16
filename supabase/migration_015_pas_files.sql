-- Migration 015: Compliance - PAS Files.
-- A running sheet (never wholesale-replaced) tracking Price As Sale orders
-- pending invoice, for the accountant. Each day's paste is merged in: rows
-- already present (matched on order_no + po) are left completely untouched;
-- only genuinely new rows get inserted. "Days" isn't stored - it's computed
-- from ship_date at render time, so it stays accurate even for rows that
-- never get re-touched. Safe to re-run.

create table if not exists pas_files (
  id uuid primary key default gen_random_uuid(),
  position int not null default 1,
  order_no text not null,
  po text,
  customer text,
  slp text,
  order_date date,
  ship_date date,
  ship_qty numeric,
  fob_amt numeric,
  whse text,
  status text,
  order_type text,
  sales_type text,
  update_notes text,
  last_contact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pas_files_order_no_po_idx on pas_files (order_no, po);

alter table pas_files enable row level security;

drop policy if exists "authenticated full access" on pas_files;
create policy "authenticated full access" on pas_files
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
