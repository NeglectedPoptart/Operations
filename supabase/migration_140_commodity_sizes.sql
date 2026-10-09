-- Migration 140: sizes on Supreme > Produce commodities.
--
-- A product is now Commodity + Variety + Size, e.g. Bell Peppers / 11lb / JBO
-- or Leafy / Red Leaf / 24ct Liner. Each size is its own row (so Arrivals,
-- Carton Inventory and exports keep working off the one combined `name`, e.g.
-- "Bell Peppers 11lb JBO"). Existing rows have no size and are unchanged.
--
-- Run migration 121 first. Safe to re-run.

alter table mx_commodities add column if not exists size text;
