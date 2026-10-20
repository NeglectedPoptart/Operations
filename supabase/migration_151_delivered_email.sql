-- Migration 151: email the Delivered price sheets straight from HOPS.
--
-- delivered_email_lists: for each lane (houston, dallas, east-coast) who the
-- price sheet goes to (To), who is copied (Cc) and who is blind-copied (Bcc),
-- and when it was last sent. Edited with the "Recipients" button on each
-- Delivered page.
--
-- Safe to re-run.

create table if not exists delivered_email_lists (
  lane text primary key,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  bcc_emails text[] not null default '{}',
  last_sent_at timestamptz,
  last_sent_by text,
  updated_at timestamptz not null default now()
);

alter table delivered_email_lists enable row level security;

drop policy if exists "authenticated full access" on delivered_email_lists;
create policy "authenticated full access" on delivered_email_lists
  for all to authenticated using (true) with check (true);
