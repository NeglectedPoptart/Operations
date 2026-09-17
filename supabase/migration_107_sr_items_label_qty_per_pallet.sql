-- Adds Label and a manually-entered Qty per Pallet to sr_items, and
-- normalizes pack_style down to the four real-world pack types
-- (Carton, Sack, Plastic, Bin) instead of free-text PStyle codes.

alter table sr_items
  add column if not exists label text,
  add column if not exists qty_per_pallet integer;

-- Existing free-text pack_style values (old PStyle codes etc.) won't match
-- the new enum - clear them so the constraint below can be added. Re-set
-- Pack Style on the affected items afterward via the dropdown in the UI.
update sr_items
  set pack_style = null
  where pack_style is not null and pack_style not in ('Carton', 'Sack', 'Plastic', 'Bin');

alter table sr_items
  drop constraint if exists sr_items_pack_style_check;

alter table sr_items
  add constraint sr_items_pack_style_check
  check (pack_style is null or pack_style in ('Carton', 'Sack', 'Plastic', 'Bin'));
