-- Local Inbounds: a checkbox marking that an inbound has been quality
-- inspected - highlights its row green on the page once checked.
alter table local_inbounds add column if not exists quality_checked boolean not null default false;
