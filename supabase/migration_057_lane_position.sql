-- Lets lanes be manually re-ordered (e.g. geographically west to east) on the
-- Broker Tracker page instead of always sorting alphabetically.
alter table lanes add column if not exists position integer;

-- Backfill existing lanes with their current alphabetical order so nothing
-- visibly reshuffles until someone actually drags a lane.
with ordered as (
  select id, row_number() over (order by from_hub, destination) - 1 as rn
  from lanes
)
update lanes set position = ordered.rn
from ordered
where lanes.id = ordered.id
  and lanes.position is null;
