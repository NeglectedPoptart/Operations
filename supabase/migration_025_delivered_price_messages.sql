-- Migration 025: Sales - Delivered Price Sheets (per-lane editable message).
-- Delivered pricing itself (LTL/FTL per commodity) is computed on the fly
-- from fob_items + fob_freight_rates - nothing to store for that. The only
-- thing that needs to persist here is the "any specials" message shown
-- under the title of each lane's delivered sheet, editable independently of
-- the FOB Pricing page's own message.

create table if not exists delivered_price_messages (
  id uuid primary key default gen_random_uuid(),
  lane text not null unique,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists delivered_price_messages_set_updated_at on delivered_price_messages;
create trigger delivered_price_messages_set_updated_at
  before update on delivered_price_messages
  for each row execute function set_updated_at();

do $$
begin
  if not exists (select 1 from delivered_price_messages where lane = 'houston') then
    insert into delivered_price_messages (lane, message) values
      ('houston', 'Please find our current price sheet attached for your review, If you have any questions or would like to discuss volume pricing or specific product needs please let us know!');
  end if;
end $$;

alter table delivered_price_messages enable row level security;

drop policy if exists "authenticated full access" on delivered_price_messages;
create policy "authenticated full access" on delivered_price_messages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
