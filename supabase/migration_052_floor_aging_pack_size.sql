-- Migration 052: QC Agenda Floor Aging - pack style + size columns.
--
-- "Pull Info from Old Age" already copies description/lot/received date/age
-- across from old_age_items, but old_age_items also carries pack_style and
-- size which had nowhere to land - add matching columns so a pulled row
-- shows the full picture, not just the commodity name.

alter table qc_agenda_floor_aging add column if not exists pack_style text;
alter table qc_agenda_floor_aging add column if not exists size text;
