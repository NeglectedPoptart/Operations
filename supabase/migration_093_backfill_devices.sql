-- One-time backfill: copies every device already recorded on Employee
-- Files' Equipment checkout log (employee_devices) into the new master
-- Devices registry, so the existing data shows up there too instead of
-- starting from an empty list. A device not yet returned keeps its
-- current holder; an already-returned one comes in unassigned (still "a
-- device we have," just not currently held by anyone) - same as adding
-- it fresh through the Devices page. Run this once - re-running it will
-- duplicate every row, since there's nothing here to key off of to tell
-- "already backfilled" apart from "a new device with the same name."
insert into devices (device_type, device_type_other, device_name, serial_number, assigned_to)
select
  device_type,
  device_type_other,
  device_name,
  serial_number,
  case when date_returned is null then employee_id else null end as assigned_to
from employee_devices;
