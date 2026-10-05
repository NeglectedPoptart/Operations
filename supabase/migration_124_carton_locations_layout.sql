-- Carton Inventory tiles: a saved drag-arranged order, and an "inactive"
-- flag for growers who still send us product (so they stay on Arrivals) but
-- do not use our cartons. Inactive only affects Carton Inventory.
alter table carton_locations add column if not exists position int not null default 0;
alter table carton_locations add column if not exists inactive boolean not null default false;
