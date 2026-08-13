-- Migration 050: Accounting - Accounts Receivable.

-- ar_customers: one row per AR customer (matched by the customer code from
-- the "AR Aging Detail by Customer" export) - credit_limit/bb_rating are
-- customer-level attributes refreshed on every re-import.
create table if not exists ar_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  customer_name text not null,
  credit_limit numeric,
  bb_rating text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ar_invoices: one row per currently-open invoice. Re-importing an updated
-- AR Aging report syncs this table (see actions.ts): an invoice already
-- here (matched on invoice_no) has its balance/dates/flags refreshed but
-- keeps whatever collections follow-up (last_contact/notes/highlight) was
-- already on it; an invoice missing from the new import (paid off) is
-- deleted; a new one is inserted.
--
-- Aging bucket (Current/1-20/21-40/41-60/61+) is deliberately NOT stored -
-- it's computed live from due_date at render time (src/lib/arAging.ts),
-- since a stored bucket would go stale the moment the report is more than
-- a few days old.
create table if not exists ar_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references ar_customers (id) on delete cascade,
  invoice_no text not null unique,
  po text,
  invoice_date date,
  due_date date,
  doc_amount numeric,
  balance numeric not null default 0,
  has_partial_credit boolean not null default false,
  trouble_status text not null default 'none' check (trouble_status in ('none', 'pending', 'posted')),
  last_contact date,
  notes text,
  highlight text not null default 'none' check (highlight in ('none', 'yellow', 'red')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ar_invoices_customer_id_idx on ar_invoices (customer_id);
create index if not exists ar_invoices_due_date_idx on ar_invoices (due_date);

drop trigger if exists ar_customers_set_updated_at on ar_customers;
create trigger ar_customers_set_updated_at
  before update on ar_customers
  for each row execute function set_updated_at();

drop trigger if exists ar_invoices_set_updated_at on ar_invoices;
create trigger ar_invoices_set_updated_at
  before update on ar_invoices
  for each row execute function set_updated_at();

alter table ar_customers enable row level security;
alter table ar_invoices enable row level security;

drop policy if exists "authenticated full access" on ar_customers;
create policy "authenticated full access" on ar_customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on ar_invoices;
create policy "authenticated full access" on ar_invoices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
