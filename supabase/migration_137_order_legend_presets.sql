-- Migration 137: the Orders legend gets five labels that are always there.
--
-- Ready, Pending PO arrival, Pending MX Inbound, Pending Purchase and
-- Pending Question. They can't be deleted (their color and opacity can still
-- be changed); extra colors can still be added. A label you already made with
-- one of these names is kept as it is and just marked as a preset.
--
-- Run migration 136 first. Safe to re-run.

alter table order_legend add column if not exists is_preset boolean not null default false;

update order_legend set is_preset = true
where lower(name) in ('ready', 'pending po arrival', 'pending mx inbound', 'pending purchase', 'pending question');

insert into order_legend (name, color, opacity, position, is_preset)
select v.name, v.color, v.opacity, v.position, true
from (values
  ('Ready',              '#13fb60', 0.14, 0),
  ('Pending PO arrival', '#f09800', 0.15, 1),
  ('Pending MX Inbound', '#00ffee', 0.17, 2),
  ('Pending Purchase',   '#f50000', 0.16, 3),
  ('Pending Question',   '#eeff00', 0.18, 4)
) as v(name, color, opacity, position)
where not exists (select 1 from order_legend l where lower(l.name) = lower(v.name));
