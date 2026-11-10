-- Migration 164: who is responsible for a load charge (Logistics > Load Charges).
--
-- Every extra charge on a load (migration 155) now says who should bear it:
--   harvest_best  - us (an expected cost, or our own mistake - see `cause`)
--   warehouse     - the warehouse made the error (payer_name = which one)
--   carrier       - the carrier's error, deducted from what we pay them
--   customer      - the receiver / customer should pay
--   other         - something else (say what in `details`)
-- and tracks getting it back (`recovery_status`, `recovered_amount`, `recovered_at`, `reference`).
--
-- Old charges keep payer = null and show as "Not assigned" until someone picks one.
-- Safe to re-run.

alter table load_charges add column if not exists payer text;
alter table load_charges add column if not exists payer_name text;
alter table load_charges add column if not exists cause text;
alter table load_charges add column if not exists recovery_status text not null default 'open';
alter table load_charges add column if not exists recovered_amount numeric(12, 2);
alter table load_charges add column if not exists recovered_at date;
alter table load_charges add column if not exists reference text;
alter table load_charges add column if not exists details text;
alter table load_charges add column if not exists updated_at timestamptz;
alter table load_charges add column if not exists updated_by text;

alter table load_charges drop constraint if exists load_charges_payer_check;
alter table load_charges add constraint load_charges_payer_check
  check (payer is null or payer in ('harvest_best', 'warehouse', 'carrier', 'customer', 'other'));

alter table load_charges drop constraint if exists load_charges_cause_check;
alter table load_charges add constraint load_charges_cause_check
  check (cause is null or cause in ('expected', 'our_error'));

alter table load_charges drop constraint if exists load_charges_recovery_status_check;
alter table load_charges add constraint load_charges_recovery_status_check
  check (recovery_status in ('open', 'billed', 'recovered', 'written_off'));

create index if not exists load_charges_payer_idx on load_charges (payer, recovery_status);
