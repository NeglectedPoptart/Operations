-- Lets Admin/Exec create extra named buckets (e.g. "Priority Customers")
-- alongside the default General Bucket, so the shared unclaimed pool can be
-- segmented before anyone claims a company into their pipeline. A company's
-- bucket_id is only meaningful while assigned_to is null - deleting a
-- bucket moves its companies back to the (implicit, bucket_id null) General
-- Bucket automatically via the FK's on delete set null.
create table if not exists crm_buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position int not null default 1,
  created_at timestamptz not null default now()
);

alter table crm_companies
  add column bucket_id uuid references crm_buckets (id) on delete set null;
create index if not exists crm_companies_bucket_id_idx on crm_companies (bucket_id);

alter table crm_buckets enable row level security;
drop policy if exists "authenticated full access" on crm_buckets;
create policy "authenticated full access" on crm_buckets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
