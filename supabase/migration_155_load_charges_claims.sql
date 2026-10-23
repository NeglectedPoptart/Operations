-- Migration 155: freight charges and claim flags on loads (Logistics > List,
-- Pending Orders Check).
--
-- load_charges: extra charges (or credits) added to a load when something happened
-- with the freight - detention, lumper, TONU, layover, and so on. Positive = extra
-- cost, negative = a credit/deduction. The load's own rate is untouched; the list
-- shows both and the total.
--
-- loads.claim_flag etc.: flags a truck as a Claim (something bad happened) with a
-- note, so it can be reviewed later. Clearing it keeps the history in the note.
--
-- Safe to re-run.

create table if not exists load_charges (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  kind text not null default 'Other',
  amount numeric(12, 2) not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists load_charges_load_idx on load_charges (load_id, created_at);

alter table load_charges enable row level security;

drop policy if exists "authenticated full access" on load_charges;
create policy "authenticated full access" on load_charges
  for all to authenticated using (true) with check (true);

alter table loads add column if not exists claim_flag boolean not null default false;
alter table loads add column if not exists claim_note text;
alter table loads add column if not exists claim_flagged_at timestamptz;
alter table loads add column if not exists claim_flagged_by text;
