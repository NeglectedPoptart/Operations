-- Migration 053: Accounting - Accounts Payable ("Accrued Payables by
-- Document" report import).
--
-- Mirrors the AR page's model: a vendor table + a payable-document table,
-- synced wholesale on each paste (matched by vendor_code+document, not a
-- full replace) - see importApReport in src/app/accounting/ap/actions.ts.

create table if not exists ap_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique,
  vendor_name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ap_vendors_position_idx on ap_vendors (position);

-- gl_account_code/label come straight from the report's own "GL Account:
-- <code> : <label>" group headers (only two today - Purchase Product and
-- Sales Expenses - but nothing here assumes exactly two). document is the
-- report's Document # column; combined with vendor_id it's the match key
-- a re-paste syncs against (paid-off documents disappear from the next
-- pull and get removed here too).
create table if not exists ap_payables (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references ap_vendors (id) on delete cascade,
  gl_account_code text not null,
  gl_account_label text not null,
  doc_date date,
  type text,
  concept text,
  document text not null,
  balance numeric not null default 0,
  last_contact date,
  notes text,
  highlight text not null default 'none',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, document)
);

create index if not exists ap_payables_vendor_id_idx on ap_payables (vendor_id);
create index if not exists ap_payables_gl_account_code_idx on ap_payables (gl_account_code);

drop trigger if exists ap_vendors_set_updated_at on ap_vendors;
create trigger ap_vendors_set_updated_at
  before update on ap_vendors
  for each row execute function set_updated_at();

drop trigger if exists ap_payables_set_updated_at on ap_payables;
create trigger ap_payables_set_updated_at
  before update on ap_payables
  for each row execute function set_updated_at();

alter table ap_vendors enable row level security;
alter table ap_payables enable row level security;

drop policy if exists "authenticated full access" on ap_vendors;
create policy "authenticated full access" on ap_vendors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on ap_payables;
create policy "authenticated full access" on ap_payables
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
