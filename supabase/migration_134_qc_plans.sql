-- Migration 134: Quality Control Manager role + QC inspection plans.
--
-- Lot Inspections replace LotPath inside HOPS. An inspection PLAN says what
-- gets recorded for one commodity at one control point (e.g. "Lettuce
-- Receiving"): the header fields, the serious / non-serious defect lists, how
-- many samples and which spec fields each sample has, and the result choices.
--
-- Only the Quality Control Manager role and the Supreme account can create or
-- change plans - enforced here in the database. Everyone signed in can read them
-- (the inspection form needs them). Safe to re-run.

-- The new role: everything Warehouse/QC has (plus plan editing, below).
insert into roles (key, label, tabs, position, is_builtin) values
  ('qc_manager', 'Quality Control Manager', '{warehouse,qc,buyers,meetings,mexico}', 10, true)
on conflict (key) do nothing;

create table if not exists qc_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  commodity text not null,
  control_point text not null default '',
  active boolean not null default true,
  position int not null default 0,
  -- {headerFields, defaultSampleSize, defects, sampleCount, sampleFields, resultOptions}
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table qc_plans enable row level security;

drop policy if exists "read qc plans" on qc_plans;
create policy "read qc plans" on qc_plans
  for select using (auth.role() = 'authenticated');

drop policy if exists "qc manager changes qc plans" on qc_plans;
create policy "qc manager changes qc plans" on qc_plans
  for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'qc_manager')
    or (auth.jwt() ->> 'email') = 'tcamph@harvestbestinc.com'
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'qc_manager')
    or (auth.jwt() ->> 'email') = 'tcamph@harvestbestinc.com'
  );

drop trigger if exists qc_plans_set_updated_at on qc_plans;
create trigger qc_plans_set_updated_at
  before update on qc_plans
  for each row execute function set_updated_at();

-- Two starting plans, transcribed from LotPath's reports. Edit them (or add the
-- rest of the commodities) from QC > Inspection Plans.
insert into qc_plans (name, commodity, control_point, position, config) values
  ('Broccoli Crowns - Grower', 'Broccoli Crowns', 'Cold Storage', 0, $json${"headerFields":[{"key":"grower","label":"Grower","type":"text","required":true},{"key":"product_label","label":"Product Label","type":"text","required":true},{"key":"lot_number","label":"Lot number","type":"text","required":true}],"defaultSampleSize":50,"defects":[{"key":"decay_pudricion","name":"Decay/Pudrición","severity":"serious"},{"key":"insect_insecto","name":"Insect/Insecto","severity":"serious"},{"key":"discoloration_decoloracion","name":"Discoloration/Decoloración","severity":"serious"},{"key":"yellowing_amarillamiento","name":"Yellowing/Amarillamiento","severity":"serious"},{"key":"mold_moho","name":"Mold/Moho","severity":"serious"},{"key":"pin_rot_pudricion","name":"Pin rot/Pudrición","severity":"serious"},{"key":"freezing_injury_q_c","name":"Freezing Injury (Q/C)","severity":"serious"},{"key":"insect_damage_dano_por_insecto","name":"Insect Damage/Daño por Insecto","severity":"serious"},{"key":"stem_decay_pudricion_en_tallo","name":"Stem Decay/Pudrición en tallo","severity":"serious"},{"key":"dehydration_deshidratacion","name":"Dehydration/Deshidratación","severity":"serious"},{"key":"broccoli_crown_disease_enfermedad_en_la_","name":"Broccoli Crown Disease / Enfermedad en la corona del brocoli","severity":"serious"},{"key":"elongated_stems","name":"Elongated Stems","severity":"serious"},{"key":"mechanical_damage_q","name":"Mechanical Damage (Q)","severity":"non_serious"},{"key":"dirt_suciedad","name":"Dirt/Suciedad","severity":"non_serious"},{"key":"injury","name":"Injury","severity":"non_serious"},{"key":"purpling_morado","name":"Purpling/Morado","severity":"non_serious"},{"key":"hollow_stem_tallo_hueco","name":"Hollow stem/ Tallo hueco","severity":"non_serious"},{"key":"dirt_or_foreign_material","name":"Dirt or Foreign Material","severity":"non_serious"},{"key":"stem_oxidation_oxidacion_en_tallo","name":"Stem oxidation/Oxidación en tallo","severity":"non_serious"},{"key":"watersoaked","name":"Watersoaked","severity":"non_serious"},{"key":"cat_eye","name":"Cat-Eye","severity":"non_serious"},{"key":"flabby_crowns","name":"Flabby Crowns","severity":"non_serious"},{"key":"bigger_than_6_mas_grande_que_6","name":"bigger than 6'' / más grande que 6''","severity":"non_serious"},{"key":"deformed_deforme","name":"Deformed/Deforme","severity":"non_serious"},{"key":"branchy_ramificado","name":"Branchy/Ramificado","severity":"non_serious"}],"sampleCount":12,"sampleFields":[{"key":"box_weight","label":"Box Weight","type":"number","unit":"Pounds"},{"key":"net_weight","label":"Net Weight","type":"number","unit":"Pounds"},{"key":"quality_score","label":"Quality Score","type":"select","options":["1","2","3","4","5"]},{"key":"temperature","label":"Temperature","type":"number","unit":"°F"},{"key":"quantity","label":"Quantity","type":"number"}],"resultOptions":["Pass","Slight caution","Caution","Urgent","Fail"]}$json$::jsonb),
  ('Lettuce Receiving', 'Lettuce', 'Receiving', 1, $json${"headerFields":[{"key":"facility","label":"Facility","type":"text"},{"key":"pack_date","label":"Pack Date","type":"date"},{"key":"grower","label":"Grower","type":"text"},{"key":"lot_number","label":"Lot number","type":"text","required":true},{"key":"product_pack_style","label":"Product Pack Style","type":"text"}],"defaultSampleSize":null,"defects":[{"key":"decay_pudricion","name":"Decay/Pudrición","severity":"serious"},{"key":"insect_insecto","name":"Insect/Insecto","severity":"serious"},{"key":"mold_moho","name":"Mold/Moho","severity":"serious"},{"key":"soft_suavidad","name":"Soft/Suavidad","severity":"serious"},{"key":"freeze_damage_dano_por_congelamiento","name":"Freeze Damage/Daño por congelamiento","severity":"serious"},{"key":"insect_damage_dano_por_insecto","name":"Insect Damage/Daño por Insecto","severity":"serious"},{"key":"bacterial_damage_dano_por_bacteria","name":"Bacterial Damage/Daño por Bacteria","severity":"serious"},{"key":"leaf_decay_pudricion_en_la_hoja","name":"Leaf Decay / Pudricion en la hoja","severity":"serious"},{"key":"stem_decay_pudricion_en_tallo","name":"Stem Decay/Pudrición en tallo","severity":"serious"},{"key":"leaf_discoloration_descoloracion_de_la_h","name":"Leaf discoloration / Descoloracion de la hoja","severity":"serious"},{"key":"broken_midribs_costillas_quebradas","name":"Broken Midribs/Costillas quebradas","severity":"non_serious"},{"key":"bruising_magullado","name":"Bruising/Magullado","severity":"non_serious"},{"key":"dirt_suciedad","name":"Dirt/Suciedad","severity":"non_serious"},{"key":"discoloration_decoloracion","name":"Discoloration/Decoloración","severity":"non_serious"},{"key":"downy_mildew","name":"Downy Mildew","severity":"non_serious"},{"key":"russeting_rojizo","name":"Russeting/Rojizo","severity":"non_serious"},{"key":"seedstem","name":"Seedstem","severity":"non_serious"},{"key":"tipburn_puntas_quemadas","name":"Tipburn/Puntas quemadas","severity":"non_serious"},{"key":"watersoaked","name":"Watersoaked","severity":"non_serious"},{"key":"mechanical_damage_q","name":"Mechanical Damage (Q)","severity":"non_serious"},{"key":"stem_oxidation_oxidacion_en_tallo","name":"Stem oxidation/Oxidación en tallo","severity":"non_serious"},{"key":"yellowing_amarillamiento","name":"Yellowing/Amarillamiento","severity":"non_serious"},{"key":"pink_ribs_costillas_rosas","name":"Pink Ribs/ Costillas Rosas","severity":"non_serious"},{"key":"messy_cut_corte_deshordenado","name":"Messy cut/Corte deshordenado","severity":"non_serious"},{"key":"dehydration_deshidratacion","name":"Dehydration/Deshidratación","severity":"non_serious"},{"key":"undersize_tamanos_pequenos","name":"Undersize/Tamaños pequeños","severity":"non_serious"},{"key":"misshapen_deforme","name":"Misshapen/Deforme","severity":"non_serious"}],"sampleCount":4,"sampleFields":[{"key":"box_weight","label":"Box Weight","type":"number","unit":"Pounds"},{"key":"packer","label":"Packer #","type":"text"},{"key":"temperature","label":"Temperature","type":"number","unit":"°F"},{"key":"cleanness","label":"Cleanness","type":"select","options":["Clean","Fairly Clean","Dirty"]},{"key":"plant_development","label":"Plant Development","type":"select","options":["Well Developed","Fairly Developed","Poorly Developed"]},{"key":"plant_trim","label":"Plant Trim","type":"select","options":["Well Trimmed","Fairly Trimmed","Poorly Trimmed"]},{"key":"pack_condition","label":"Pack Condition","type":"select","options":["Well Filled","Fairly Filled","Poorly Filled"]},{"key":"score","label":"Score","type":"select","options":["1","2","3","4","5"]},{"key":"comments","label":"Comments","type":"text"}],"resultOptions":["Pass","Slight caution","Caution","Urgent","Fail"]}$json$::jsonb)
on conflict (name) do nothing;
