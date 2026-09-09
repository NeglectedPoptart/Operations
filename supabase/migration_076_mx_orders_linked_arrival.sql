-- Lets a fulfilled Order create (and remember) the Arrivals row that's
-- actually sourcing it, so the same order can't be sent to Arrivals twice.
alter table public.mx_orders
  add column linked_arrival_id uuid references public.mx_arrivals(id) on delete set null;
