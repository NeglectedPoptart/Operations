-- Migration 132: combine like rows on the Old Age Cash List.
--
-- A Cash List line can stand for several items that share a description,
-- pack style and size (condensed list), or leave them apart when different
-- ages need different prices. cash_combined marks the items that are rolled
-- into one line. Safe to re-run.

alter table old_age_items add column if not exists cash_combined boolean not null default false;
