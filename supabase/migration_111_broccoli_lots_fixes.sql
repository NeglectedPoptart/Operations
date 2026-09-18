-- Two fixes discovered testing the Broccoli Inventory pull buttons:
--
-- 1. A partial unique index (`where x is not null`) can't be used as an
--    upsert's ON CONFLICT target - Postgres has no way to match "ON
--    CONFLICT (col)" against it, so every upsert in pullFromWarehouse/
--    pullFromArrivals was failing with a 500. A plain unique constraint
--    already allows unlimited NULLs (NULL is never "equal" to another NULL
--    for uniqueness purposes), so it does everything the partial index was
--    trying to do, without the ON CONFLICT problem.
-- 2. source_lot_id was wired to sr_inventory_lots (Shipping/Receiving's
--    prototype ERP), but the warehouse's real day-to-day floor tracking
--    turned out to be Cold Inventory (cold_inventory_items) instead - drop
--    that now-wrong foreign key.

alter table broccoli_lots drop constraint if exists broccoli_lots_source_lot_id_fkey;

drop index if exists broccoli_lots_source_lot_idx;
drop index if exists broccoli_lots_source_arrival_idx;
alter table broccoli_lots add constraint broccoli_lots_source_lot_id_key unique (source_lot_id);
alter table broccoli_lots add constraint broccoli_lots_source_arrival_id_key unique (source_arrival_id);

drop index if exists broccoli_orders_source_order_idx;
alter table broccoli_orders add constraint broccoli_orders_source_order_id_key unique (source_order_id);
