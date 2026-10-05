-- Arrivals: the carton used is now picked per arrival row (from the
-- grower's own carton inventory) instead of being inferred from a
-- product -> carton type mapping on Supreme > Produce.
alter table mx_arrivals add column if not exists carton_type_id uuid references carton_types (id) on delete set null;

-- Rows that already generated an auto-deduction under the old product
-- mapping keep working: adopt the carton type those deductions used so the
-- next edit doesn't silently drop them.
update mx_arrivals a
set carton_type_id = (
  select t.carton_type_id
  from carton_transactions t
  where t.source_arrival_id = a.id and t.source = 'arrival'
  limit 1
)
where a.carton_type_id is null;
