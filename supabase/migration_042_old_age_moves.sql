-- Migration 042: Old Age - editable Qty (already possible via the existing
-- update path, no schema change needed) plus a "Partial Moved" next step
-- with its own ledger of moves (order + qty taken), same running-total
-- pattern as Repack Inventory's current_stock/repack_adjustments.
alter table old_age_items add column if not exists qty_moved numeric not null default 0;

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'old_age_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%next_step%'
  loop
    execute format('alter table old_age_items drop constraint %I', r.conname);
  end loop;
end $$;

alter table old_age_items add constraint old_age_items_next_step_check
  check (next_step in ('pending_qc', 'cash_sale', 'repack', 'as_is', 'dump_donate', 'moved', 'partial_moved'));

create table if not exists old_age_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references old_age_items (id) on delete cascade,
  entry_date date not null default current_date,
  order_reference text,
  qty numeric not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists old_age_moves_item_id_idx on old_age_moves (item_id);

create or replace function apply_old_age_move()
returns trigger as $$
begin
  update old_age_items set qty_moved = qty_moved + new.qty where id = new.item_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists old_age_moves_apply_insert on old_age_moves;
create trigger old_age_moves_apply_insert
  after insert on old_age_moves
  for each row execute function apply_old_age_move();

create or replace function reverse_old_age_move()
returns trigger as $$
begin
  update old_age_items set qty_moved = qty_moved - old.qty where id = old.item_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists old_age_moves_reverse_delete on old_age_moves;
create trigger old_age_moves_reverse_delete
  after delete on old_age_moves
  for each row execute function reverse_old_age_move();

alter table old_age_moves enable row level security;

drop policy if exists "authenticated full access" on old_age_moves;
create policy "authenticated full access" on old_age_moves
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
