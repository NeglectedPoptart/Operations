-- Lets "Pull Arrivals" on the QC Agenda's Inbounds section dedupe against
-- what's already been pulled in for a given day, same "source id" pattern
-- as qc_agenda_floor_aging.old_age_item_id / qc_agenda_holdovers.qc_inspection_id.
alter table public.qc_agenda_inbounds
  add column mx_arrival_id uuid references public.mx_arrivals(id) on delete set null;
