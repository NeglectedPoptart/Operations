-- Migration 163: Broker Pending List (the carrier portal).
--
-- A Broker/Carrier login (migration 049) now gets a "Broker Pending List": a tile for every load
-- booked under their company. On it they can read the load (dates, PU numbers, stops, rate),
-- e-sign the rate confirmation, confirm the rate, add an ETA, upload the POD (staff review it and
-- mark the load Delivered) and ask for extra charges (layover, redelivery, added stops) that staff
-- approve or reject.
--
--   loads                    new columns for signed / rate confirmed / ETA entered by hand / POD waiting
--   load_documents           now also holds the rate confirmation scan, its signed copy, charge receipts
--   load_signatures          one row per e-signature (who, when, from where, the drawn signature)
--   broker_charge_requests   charges a carrier asks for; approving one adds it to the load's charges
--
-- Security: these are outside companies' logins. The loads tables and the document bucket used to be
-- readable by any signed-in user; they are now closed to Broker/Carrier logins (the portal reads
-- through the server, always limited to that login's own company).
--
-- Run migrations 049, 126 and 155 first. Safe to re-run.

-- ---------------------------------------------------------------------------
-- loads
alter table loads add column if not exists ratecon_signed_at timestamptz;
alter table loads add column if not exists ratecon_signed_by text;
alter table loads add column if not exists rate_confirmed_at timestamptz;
alter table loads add column if not exists rate_confirmed_by text;
-- The rate the carrier confirmed: if the rate is changed afterwards, the carrier is asked to confirm again.
alter table loads add column if not exists rate_confirmed_amount numeric(12, 2);
alter table loads add column if not exists eta_updated_at timestamptz;
alter table loads add column if not exists eta_updated_by text;
-- The carrier uploaded a POD that staff have not reviewed yet.
alter table loads add column if not exists pod_submitted_at timestamptz;
-- Why a POD was sent back (shown to the carrier until they upload a new one).
alter table loads add column if not exists pod_rejected_note text;

-- ---------------------------------------------------------------------------
-- load_documents: more kinds, carrier uploads, review state
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'load_documents'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%kind%' or pg_get_constraintdef(oid) ilike '%source%')
  loop
    execute format('alter table load_documents drop constraint %I', r.conname);
  end loop;
end $$;

alter table load_documents add constraint load_documents_kind_check
  check (kind in ('pod', 'ratecon', 'ratecon_signed', 'charge_support', 'other'));
alter table load_documents add constraint load_documents_source_check
  check (source in ('email', 'manual', 'carrier'));

alter table load_documents add column if not exists parent_id uuid references load_documents (id) on delete set null;
-- null = nothing to review; pending / approved / rejected for a carrier-uploaded POD.
alter table load_documents add column if not exists review_status text check (review_status in ('pending', 'approved', 'rejected'));
alter table load_documents add column if not exists review_note text;
alter table load_documents add column if not exists uploaded_by text;

-- ---------------------------------------------------------------------------
-- load_signatures
create table if not exists load_signatures (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  broker_id uuid references brokers (id) on delete set null,
  signer_name text not null,
  signer_title text,
  signer_email text,
  signer_user_id uuid,
  -- The drawn signature (PNG) in the load-documents bucket.
  signature_path text not null,
  rate_at_signing numeric(12, 2),
  ip text,
  user_agent text,
  signed_at timestamptz not null default now()
);
create index if not exists load_signatures_load_idx on load_signatures (load_id, signed_at);

-- ---------------------------------------------------------------------------
-- broker_charge_requests
create table if not exists broker_charge_requests (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  broker_id uuid references brokers (id) on delete set null,
  kind text not null default 'Other',
  amount numeric(12, 2) not null,
  note text,
  submitted_by text,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  -- The charge this became on the load once approved.
  load_charge_id uuid references load_charges (id) on delete set null
);
create index if not exists broker_charge_requests_load_idx on broker_charge_requests (load_id, submitted_at);
create index if not exists broker_charge_requests_status_idx on broker_charge_requests (status);

-- A receipt / photo attached to a charge request.
alter table load_documents add column if not exists charge_request_id uuid references broker_charge_requests (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Row-level security: staff keep full access; a Broker/Carrier login gets nothing straight from
-- the database (the portal reads and writes through the server, limited to that login's company).
do $$
declare
  t text;
begin
  foreach t in array array['loads', 'load_stops', 'load_pickups', 'load_documents', 'load_charges', 'load_signatures', 'broker_charge_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format(
      'create policy "staff full access" on public.%I for all to authenticated using (not public.is_broker_carrier()) with check (not public.is_broker_carrier())',
      t
    );
  end loop;
end $$;

-- The document bucket: the same, so a carrier can never list or download another carrier's files.
-- (Carrier uploads go through short-lived signed upload links the server hands out per load.)
drop policy if exists "authenticated manage load-documents" on storage.objects;
create policy "authenticated manage load-documents" on storage.objects
  for all using (bucket_id = 'load-documents' and auth.role() = 'authenticated' and not public.is_broker_carrier())
  with check (bucket_id = 'load-documents' and auth.role() = 'authenticated' and not public.is_broker_carrier());
