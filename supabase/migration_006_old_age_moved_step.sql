-- Run this in the Supabase SQL Editor to add "Moved" as an Old Age next step.

alter table old_age_items drop constraint if exists old_age_items_next_step_check;
alter table old_age_items add constraint old_age_items_next_step_check
  check (next_step in ('pending_qc', 'cash_sale', 'repack', 'as_is', 'dump_donate', 'moved'));
