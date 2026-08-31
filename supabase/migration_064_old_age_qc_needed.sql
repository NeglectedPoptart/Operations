-- Old Age gets a "QC Needed" checkbox so the sheet can flag which items
-- still need a QC look. QC Agenda's "Pull Info from Old Age" button then
-- only imports rows flagged this way, instead of every Old Age item.
alter table old_age_items
  add column if not exists qc_needed boolean not null default false;
