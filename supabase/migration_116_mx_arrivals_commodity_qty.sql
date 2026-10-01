-- Phase 2 of Carton Inventory (see migration_114): a qty per commodity slot
-- on Arrivals, so a received line can deduct straight from the grower's
-- carton balance. Mirrors the existing commodity_N_id 4-slot convention.
alter table mx_arrivals
  add column if not exists commodity_1_qty numeric,
  add column if not exists commodity_2_qty numeric,
  add column if not exists commodity_3_qty numeric,
  add column if not exists commodity_4_qty numeric;
