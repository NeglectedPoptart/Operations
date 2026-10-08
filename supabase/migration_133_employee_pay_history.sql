-- Migration 133: pay history on Employee Files.
--
-- One row per pay rate an employee has had: hourly or salary, the amount, the
-- date it took effect, and a note (starting pay, raise, promotion...). The
-- latest row by date is their current pay; the earlier rows are their past
-- pay and show when each raise was given.
--
-- Pay is sensitive, so unlike most tables this is NOT open to every signed-in
-- user: only the Admin and Executive roles and the Supreme account can read or
-- change it (enforced here in the database, not just hidden in the page).
-- Safe to re-run.

create table if not exists employee_pay_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  effective_date date not null,
  pay_type text not null check (pay_type in ('hourly', 'salary')),
  -- Dollars per hour, or dollars per year for a salary.
  amount numeric(12, 2) not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists employee_pay_history_employee_idx on employee_pay_history (employee_id, effective_date desc);

alter table employee_pay_history enable row level security;

drop policy if exists "pay history admin executive supreme" on employee_pay_history;
create policy "pay history admin executive supreme" on employee_pay_history
  for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'executive'))
    or (auth.jwt() ->> 'email') = 'tcamph@harvestbestinc.com'
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'executive'))
    or (auth.jwt() ->> 'email') = 'tcamph@harvestbestinc.com'
  );
