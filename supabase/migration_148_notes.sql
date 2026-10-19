-- Migration 148: personal Notes (the Notes pad that floats on every page, the
-- Dashboard Notes widget, and the pop-out Notes window).
--
-- user_notes: each person's own notes. Everyone sees and changes only their own.
--
-- Safe to re-run.

create table if not exists user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_notes_user on user_notes (user_id, updated_at desc);

alter table user_notes enable row level security;

drop policy if exists "own notes" on user_notes;
create policy "own notes" on user_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
