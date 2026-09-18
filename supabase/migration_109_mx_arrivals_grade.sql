-- Grade (#1/#2) is set on the Mexico side, but until now it was only
-- implicit in which commodity got picked ("Broccoli #1" vs "Broccoli #2").
-- A real field lets it be edited independently, same as mx_orders.grade
-- already does.
alter table mx_arrivals add column if not exists grade text;
