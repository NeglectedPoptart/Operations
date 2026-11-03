-- Migration 159: the morning "Availability" pricing email, read automatically.
--
-- Jacob Romero's Availability email (redirected by an Outlook rule to the HOPS mailbox) is
-- picked up by the HOPS inbox reader, parsed with the same parser as FOB Pharr's
-- "Paste from Email", and applied to today's FOB sheet. One row per email, so each is only
-- processed once and FOB Pharr can show what happened (and let someone apply a late one).
--
-- Safe to re-run.

create table if not exists fob_email_imports (
  id uuid primary key default gen_random_uuid(),
  graph_message_id text not null unique,
  received_at timestamptz not null,
  from_email text,
  subject text,
  body_text text not null default '',
  entry_date date not null,
  -- applied = prices filled in; skipped = arrived outside the morning window (apply by hand);
  -- nothing_found = no price lines in the email; error = something failed (see note)
  status text not null check (status in ('applied', 'skipped', 'nothing_found', 'error')),
  prices_found integer not null default 0,
  items_updated integer not null default 0,
  -- price lines that matched no FOB item: [{category, label, price}]
  unmatched jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists fob_email_imports_date_idx on fob_email_imports (entry_date, created_at desc);

alter table fob_email_imports enable row level security;
drop policy if exists "authenticated full access" on fob_email_imports;
create policy "authenticated full access" on fob_email_imports
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
