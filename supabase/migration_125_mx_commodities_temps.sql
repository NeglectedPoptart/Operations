-- Supreme > Produce: a temperature range (low / high) per commodity, like
-- the ERP's Commodity - Variety window. Kept on every product row of a
-- Commodity Group (the group is just the shared commodity_group text), and
-- always written to all of a group's rows together from the Produce page.
alter table mx_commodities add column if not exists temp_low numeric;
alter table mx_commodities add column if not exists temp_high numeric;
