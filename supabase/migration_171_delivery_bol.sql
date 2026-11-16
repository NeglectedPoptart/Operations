-- Migration 171: Delivery BOL on a load (Logistics > Load Board).
--
-- When a load is added (or edited), staff can attach the Delivery BOL - the paperwork the driver hands over at the
-- delivery. It's optional: it doesn't happen on every load. The carrier sees it on their Broker Pending List
-- tile with a download button, so they can pass it on to the driver.
--
-- load_documents.kind gets a new value, 'delivery_bol'. Run migration 163 first. Safe to re-run.

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'load_documents'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table load_documents drop constraint %I', r.conname);
  end loop;
end $$;

alter table load_documents add constraint load_documents_kind_check
  check (kind in ('pod', 'ratecon', 'ratecon_signed', 'charge_support', 'other', 'delivery_bol'));
