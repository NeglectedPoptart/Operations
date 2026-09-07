-- Job title alongside each employee name, so Performance Reviews (and any
-- other feature drawing on this list) can show role context, not just a name.
alter table employees add column if not exists title text;

insert into employees (name, title) values
  ('Robbie Ramirez', 'Buyer'),
  ('Elena Cullers', 'Accounting Associate'),
  ('Edgar Cantu', 'Quality Inspector'),
  ('Brittney Turner', 'Accounting Associate'),
  ('Diego Ruiz', 'MX Supply Chain Coordinator'),
  ('Tyler Sulay', 'Food Safety & Claims Manager'),
  ('Eduardo Frias', 'Operations Coordinator'),
  ('Mario Perez', 'MX Supply Chain Coordinator')
on conflict (name) do update set title = excluded.title;
