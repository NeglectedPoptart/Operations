-- Migration 020: Sales - Pending to Invoice.
-- Same paste-import as PAS Files (Compliance) - when the full pending-to-
-- invoice export is pasted there, rows marked PAS (on PO or Order Type) go
-- to pas_files as before, and everything else lands here instead. A running
-- list matched on order_no + po; rows are deleted once invoiced. Safe to
-- re-run.

create table if not exists pending_to_invoice (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pending_to_invoice_order_no_po_idx on pending_to_invoice (order_no, po);

alter table pending_to_invoice enable row level security;

drop policy if exists "authenticated full access" on pending_to_invoice;
create policy "authenticated full access" on pending_to_invoice
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
