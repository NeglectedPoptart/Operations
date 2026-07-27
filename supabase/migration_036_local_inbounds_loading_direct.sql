-- Migration 036: Local Inbounds - add "Loading Direct" status, a section
-- between Pending and Arrived that behaves identically to Pending.
alter table local_inbounds drop constraint if exists local_inbounds_status_check;
alter table local_inbounds add constraint local_inbounds_status_check
  check (status in ('pending', 'loading_direct', 'arrived'));
