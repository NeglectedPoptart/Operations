-- Migration 008: dedupe the locked Source/Destination lists.
-- migration_007's backfill ran before the historical loads import, so it
-- only caught a handful of hand-entered test values (several of them
-- inconsistent - missing state, mixed case) and never picked up the 302
-- historical loads' destinations at all. This migration cleans up the
-- known Source variants, re-runs the destination backfill now that the
-- historical data is in load_stops, and generically merges any
-- case-insensitive duplicates left in destination_cities.
-- Safe to re-run.

-- Hubs: known non-canonical variants -> canonical "City, ST" --------------
update loads set source = 'Pharr, TX'
where source is not null and upper(trim(source)) in ('PHARR', 'PAHRR', 'PHARR, TX', 'PHARR,TX');

update loads set source = 'Salinas, CA'
where source is not null and upper(trim(source)) = 'SALINAS';

update loads set source = 'Yuma, AZ'
where source is not null and upper(trim(source)) = 'YUMA';

update loads set source = 'Pharr, TX' where source = 'Pharr, Tx';

delete from hubs where upper(trim(name)) in ('PHARR', 'PAHRR', 'SALINAS', 'YUMA');
update hubs set name = 'Pharr, TX' where name = 'Pharr, Tx'
  and not exists (select 1 from hubs h2 where h2.name = 'Pharr, TX');
delete from hubs where name = 'Pharr, Tx';

-- Require a state going forward (belt-and-suspenders alongside the client
-- side "City, ST" validation on the + Add option) - stops a future direct
-- insert from recreating this mess.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hubs_name_has_state') then
    alter table hubs add constraint hubs_name_has_state check (name like '%,%');
  end if;
end $$;

-- Destination cities: re-run the backfill now that the historical import's -
-- load_stops rows exist (idempotent, see migration_007).
insert into destination_cities (city, state)
select distinct trim(destination_city), trim(destination_state)
from load_stops
where destination_city is not null and trim(destination_city) <> ''
  and destination_state is not null and trim(destination_state) <> ''
on conflict (city, state) do nothing;

insert into destination_cities (city, state)
select distinct trim(parts[1]), trim(parts[2])
from (
  select regexp_split_to_array(trim(seg), '\s*,\s*') as parts
  from (
    select unnest(string_to_array(regexp_replace(destination, '\s*\(\d+\s*Drop\)', '', 'g'), '&')) as seg
    from lanes
  ) s
) t
where array_length(parts, 1) = 2
on conflict (city, state) do nothing;

-- Case-insensitive dedupe of destination_cities: for every city/state that
-- differs only by case, pick one canonical spelling (prefer proper
-- "Title Case, XX" if present), repoint every load_stop using a losing
-- variant to the canonical spelling, then drop the losing rows.
do $$
declare
  grp record;
  canonical_city text;
  canonical_state text;
begin
  for grp in
    select upper(trim(city)) as ckey, upper(trim(state)) as skey
    from destination_cities
    group by upper(trim(city)), upper(trim(state))
    having count(*) > 1
  loop
    select city, state into canonical_city, canonical_state
    from destination_cities
    where upper(trim(city)) = grp.ckey and upper(trim(state)) = grp.skey
    order by (city = initcap(city) and state = upper(state)) desc, city, state
    limit 1;

    update load_stops
    set destination_city = canonical_city, destination_state = canonical_state
    where destination_city is not null and destination_state is not null
      and upper(trim(destination_city)) = grp.ckey and upper(trim(destination_state)) = grp.skey
      and (destination_city <> canonical_city or destination_state <> canonical_state);

    delete from destination_cities
    where upper(trim(city)) = grp.ckey and upper(trim(state)) = grp.skey
      and not (city = canonical_city and state = canonical_state);
  end loop;
end $$;
