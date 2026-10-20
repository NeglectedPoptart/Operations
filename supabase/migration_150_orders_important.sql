-- Migration 150: mark an order as important (Warehouse > Orders).
--
-- pending_orders.important: starred orders are pinned in an "Important" section
-- at the top of the Orders page for extra review. Loading a new report keeps it.
--
-- Safe to re-run.

alter table pending_orders add column if not exists important boolean not null default false;
