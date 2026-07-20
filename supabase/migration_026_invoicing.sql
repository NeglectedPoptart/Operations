-- Migration 026: Logistics - Invoicing (per-broker aging list).
-- Broker statements are pasted in (Invoice #, Invoice Date, Customer PO,
-- Amount) - merge-only import matched on (broker_id, invoice_no), same
-- reasoning as PAS Files/Pending to Invoice. Age is never stored - it's
-- computed from invoice_date at render/copy time (see daysSince() in
-- src/lib/dates.ts) so it stays accurate without needing daily edits.

create table if not exists invoice_statements (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references brokers (id) on delete cascade,
  invoice_no text not null,
  invoice_date date,
  customer_po text,
  amount numeric,
  status text check (status in ('pending', 'done')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_statements_broker_id_idx on invoice_statements (broker_id);
create unique index if not exists invoice_statements_broker_invoice_idx on invoice_statements (broker_id, invoice_no);

drop trigger if exists invoice_statements_set_updated_at on invoice_statements;
create trigger invoice_statements_set_updated_at
  before update on invoice_statements
  for each row execute function set_updated_at();

alter table invoice_statements enable row level security;

drop policy if exists "authenticated full access" on invoice_statements;
create policy "authenticated full access" on invoice_statements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
