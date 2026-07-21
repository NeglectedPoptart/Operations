-- Migration 029: Manual display order for broker tiles on the Invoicing
-- home page ("Edit Layout" - lets the team pin the busiest carriers to top).
alter table brokers add column if not exists position integer;

-- Backfill existing brokers in their current alphabetical order so nothing
-- jumps around the first time this loads.
with ordered as (
  select id, row_number() over (order by name) as rn
  from brokers
  where position is null
)
update brokers set position = ordered.rn
from ordered
where brokers.id = ordered.id;

alter table brokers alter column position set default 0;
alter table brokers alter column position set not null;
