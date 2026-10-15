-- Migration 144: Phone is split into "Cell phone" and "Desk phone".
--
-- Every device saved as plain "Phone" becomes "Cell phone" (change any desk
-- phones to "Desk phone" on Supreme > Devices afterwards). Optional tidy-up:
-- the Devices page already treats an old "Phone" as a cell phone.
--
-- Safe to re-run.

update devices set device_type = 'Cell phone' where device_type = 'Phone';
update employee_devices set device_type = 'Cell phone' where device_type = 'Phone';
