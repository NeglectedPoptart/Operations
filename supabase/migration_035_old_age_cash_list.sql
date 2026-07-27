-- Migration 035: Old Age - "Cash List" flag + price.
-- A quick checkbox (separate from the Next Step dropdown) that pulls an item
-- into the Cash List section at the top of the page, plus a price field only
-- used there.
alter table old_age_items add column if not exists cash_list boolean not null default false;
alter table old_age_items add column if not exists cash_price numeric;
