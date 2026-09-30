-- Arrivals: a checkbox marking that a load has physically arrived on site.
-- Rows stay on the sheet permanently rather than being deleted or moved off
-- once arrived (so Carton Inventory's per-commodity qty deduction and the
-- historical record of what came in stay intact) - this just greys the row
-- out so a full week's list isn't cluttered with loads already on site.
alter table mx_arrivals add column if not exists arrived boolean not null default false;
