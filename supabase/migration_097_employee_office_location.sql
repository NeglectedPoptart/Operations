-- Which physical office an employee is assigned to. Personal/work-cell
-- phone formatting in the UI switches to Mexican format when this is set
-- to the Guadalajara, MX office.
alter table employees add column if not exists office_location text;

alter table employees drop constraint if exists employees_office_location_check;
alter table employees add constraint employees_office_location_check
  check (
    office_location is null
    or office_location in ('Monterey, CA', 'Pharr, TX', 'Guadalajara, MX', 'San Antonio, TX')
  );
