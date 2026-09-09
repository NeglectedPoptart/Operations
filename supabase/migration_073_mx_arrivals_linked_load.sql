-- Lets a Mexico Arrivals row be paired with the domestic Logistics load
-- actually carrying it onward, so the Logistics board can flag that load as
-- already spoken for ("Selected Lot").
alter table public.mx_arrivals
  add column linked_load_id uuid references public.loads(id) on delete set null;
