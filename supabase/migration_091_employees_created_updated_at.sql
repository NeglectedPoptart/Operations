-- Corrective #2 (recorded after the fact - already run manually): the
-- trigger created for employees in migration_088 (employees_set_updated_at)
-- references updated_at on every update via set_updated_at(), but that
-- column - like the ones found missing in migration_090 - never actually
-- existed on the live table. Every single update to employees was failing
-- with the same Postgres error regardless of which field was being
-- changed, which is what was silently swallowing every save.
alter table employees add column if not exists created_at timestamptz not null default now();
alter table employees add column if not exists updated_at timestamptz not null default now();

-- Defensive: same idempotent guard on the two sibling tables in case they
-- were similarly affected.
alter table employee_documents add column if not exists created_at timestamptz not null default now();
alter table employee_devices add column if not exists created_at timestamptz not null default now();
alter table employee_devices add column if not exists updated_at timestamptz not null default now();
