-- Supreme > Produce: break each flat Product name into a Commodity Group
-- (e.g. "Bell Pepper") and a Variety within it (e.g. "Red") - `name` is kept
-- as the single combined label everything else (Arrivals' dropdown, Carton
-- Inventory, exports) already reads, auto-recomputed from these two fields
-- whenever either is edited from the Produce page.
--
-- Nullable rather than required: a commodity auto-created from an Arrivals
-- paste import (resolveByName in arrivals/actions.ts) only ever supplies a
-- flat name, with no group/variety breakdown - the Produce page falls back
-- to grouping by `name` itself for any row where commodity_group is null.
alter table mx_commodities add column if not exists commodity_group text;
alter table mx_commodities add column if not exists variety text;

-- Backfill existing rows so each starts out as its own one-item group
-- (named after itself) rather than appearing ungrouped - a human then
-- merges related varieties (e.g. "Broccoli #1"/"Broccoli #2") under a
-- shared group name at their own pace from the Produce page.
update mx_commodities set commodity_group = name where commodity_group is null;
