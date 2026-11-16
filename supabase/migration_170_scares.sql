-- Migration 170: Scare (Supreme Tab > Scare).
--
-- Pick a person on the Scare page and press the button: the next time their HOPS screen checks in (within a few
-- seconds, while they're using it) a full-screen jump scare pops up, then goes away on its own or when they tap it.
--
-- scares: one row per scare sent. shown_at is filled in when it reached their screen, so the Scare page can show
-- "delivered". A scare nobody saw within 15 minutes is simply never shown.
--
-- Only the server touches this table (service role), so row-level security is on with no policies. Safe to re-run.

create table if not exists scares (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references profiles (id) on delete cascade,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  shown_at timestamptz
);
create index if not exists scares_target_idx on scares (target_user_id, created_at desc);

alter table scares enable row level security;
