-- Unit is now a Case/Pallet selection in the UI rather than free text.
alter table repack_costs drop constraint if exists repack_costs_unit_check;
alter table repack_costs add constraint repack_costs_unit_check
  check (unit is null or unit in ('Case', 'Pallet'));
