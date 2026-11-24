-- Migration 176: loads.source_is_pickup.
--
-- A load's Source City normally counts as the truck's first pickup (so Source City + 2 extra pickups = "3 picks").
-- When everything on the truck is bought from vendors, the Source City is just the origin lane, not a pickup -
-- turn this off and the tile counts only the pickups you list.
--
-- Safe to re-run. Existing loads stay as they are (true).

alter table loads add column if not exists source_is_pickup boolean not null default true;
