-- Splits out Commodity/Variety/Grade as their own fields on sr_items so the
-- new Warehouse Desk view (ERP > Inventory) can group by them the way the
-- reference produce-ERP screen does - name is left as-is (still the
-- required, unique display field), these are additive.
alter table sr_items add column if not exists commodity text;
alter table sr_items add column if not exists variety text;
alter table sr_items add column if not exists grade text;
