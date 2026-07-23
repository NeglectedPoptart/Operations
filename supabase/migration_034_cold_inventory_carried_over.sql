-- Migration 034: Cold Inventory - "carried over" marker.
-- On each daily paste: Good (or unmarked) items always reset to unmarked,
-- since the whole list gets reviewed fresh every day. Issue/Dump items that
-- still exactly match (same manifest+commodity+size) keep their status and
-- notes as before, but are now flagged carried_over so it's clear on sight
-- that this one ported over from a prior day rather than being freshly
-- reviewed today. Any manual status change clears the flag again.
alter table cold_inventory_items add column if not exists carried_over boolean not null default false;
