"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, mondayOf } from "@/lib/dates";
import { OLD_AGE_NEXT_STEPS } from "@/lib/types";
import type { MxArrivalDay, QcInboundStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/qc/agenda");
}

// Header (Prepared By / QC1 / QC2) --------------------------------------------

export async function saveQcAgendaMeta(
  entryDate: string,
  patch: { prepared_by?: string | null; qc1?: string | null; qc2?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("qc_agenda_meta")
    .upsert({ entry_date: entryDate, ...patch }, { onConflict: "entry_date" });
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Inbounds ---------------------------------------------------------------------

export async function addInboundRow(entryDate: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qc_agenda_inbounds")
    .insert({ entry_date: entryDate, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateInboundRow(
  id: string,
  patch: {
    vendor_origin?: string | null;
    commodity_sku?: string | null;
    po_load_number?: string | null;
    carrier?: string | null;
    eta?: string | null;
    photo_report?: string | null;
    status?: QcInboundStatus | null;
    notes?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_inbounds").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteInboundRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_inbounds").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Arrivals only ever records a weekday within its own week (week_start_date
// is always a Monday) - not a stored calendar date - so a day's actual
// arrivals are found by matching week_start_date + arrival_day, not by
// scanning every arrival for a computed date.
const WEEKDAY_BY_UTC_DAY: MxArrivalDay[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Copies whatever Mexico Arrivals are booked to land on this exact date
// into today's Inbounds list, skipping rows already pulled in for this date
// so re-clicking is safe. Same dedupe pattern as pullOldAgeIntoFloorAging /
// pullHoldoversFromInspections below.
export async function pullArrivalsForDate(entryDate: string) {
  const supabase = await createClient();
  const weekStart = mondayOf(entryDate);
  const arrivalDay = WEEKDAY_BY_UTC_DAY[new Date(`${entryDate}T00:00:00Z`).getUTCDay()];

  const [{ data: arrivals, error: arrivalsError }, { data: existingRows, error: existingError }] = await Promise.all([
    supabase
      .from("mx_arrivals")
      .select("*")
      .eq("week_start_date", weekStart)
      .eq("arrival_day", arrivalDay)
      .order("position", { ascending: true }),
    supabase.from("qc_agenda_inbounds").select("mx_arrival_id").eq("entry_date", entryDate),
  ]);
  if (arrivalsError) throw new Error(arrivalsError.message);
  if (existingError) throw new Error(existingError.message);

  const alreadyPulled = new Set((existingRows ?? []).map((r) => r.mx_arrival_id).filter(Boolean));
  const toPull = (arrivals ?? []).filter((a) => !alreadyPulled.has(a.id));
  if (toPull.length === 0) return [];

  const growerIds = [...new Set(toPull.map((a) => a.grower_id).filter((id): id is string => id !== null))];
  const commodityIds = [
    ...new Set(
      toPull
        .flatMap((a) => [a.commodity_1_id, a.commodity_2_id, a.commodity_3_id, a.commodity_4_id])
        .filter((id): id is string => id !== null),
    ),
  ];
  const [{ data: growers }, { data: commodities }] = await Promise.all([
    growerIds.length > 0
      ? supabase.from("mx_growers").select("id, name, origin").in("id", growerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; origin: string | null }[] }),
    commodityIds.length > 0
      ? supabase.from("mx_commodities").select("id, name").in("id", commodityIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const growerById = new Map((growers ?? []).map((g) => [g.id as string, g]));
  const commodityNameById = new Map((commodities ?? []).map((c) => [c.id as string, c.name as string]));

  const { data: maxPositionRows } = await supabase
    .from("qc_agenda_inbounds")
    .select("position")
    .eq("entry_date", entryDate)
    .order("position", { ascending: false })
    .limit(1);
  let nextPosition = (maxPositionRows?.[0]?.position ?? 0) + 1;

  const rows = toPull.map((a) => {
    const grower = a.grower_id ? growerById.get(a.grower_id) : null;
    const commodityNames = [a.commodity_1_id, a.commodity_2_id, a.commodity_3_id, a.commodity_4_id]
      .filter((id): id is string => id !== null)
      .map((id) => commodityNameById.get(id))
      .filter((name): name is string => Boolean(name));
    const notesParts = [
      a.boxes_approx ? `Qty: ${a.boxes_approx}` : null,
      a.price_to_grower ? `Price: ${a.price_to_grower}` : null,
      a.notes,
    ].filter(Boolean);

    return {
      entry_date: entryDate,
      position: nextPosition++,
      vendor_origin: grower ? [grower.name, grower.origin].filter(Boolean).join(" - ") : null,
      commodity_sku: commodityNames.length > 0 ? commodityNames.join(" / ") : null,
      po_load_number: a.manifesto,
      carrier: a.truck_group,
      notes: notesParts.length > 0 ? notesParts.join(" · ") : null,
      mx_arrival_id: a.id,
    };
  });

  const { data, error } = await supabase.from("qc_agenda_inbounds").insert(rows).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

// Floor Aging Check --------------------------------------------------------------

const NEXT_STEP_LABELS = Object.fromEntries(OLD_AGE_NEXT_STEPS.map((s) => [s.value, s.label]));

// Copies whatever is currently flagged "QC Needed" in Old Age into today's
// Floor Aging Check list, skipping items already pulled in for this date so
// re-clicking is safe. The user prunes down what's not relevant with the
// row delete button.
export async function pullOldAgeIntoFloorAging(entryDate: string) {
  const supabase = await createClient();

  const [{ data: oldAgeItems, error: oldAgeError }, { data: existingRows, error: existingError }] = await Promise.all([
    supabase.from("old_age_items").select("*").eq("qc_needed", true).order("position", { ascending: true }),
    supabase.from("qc_agenda_floor_aging").select("old_age_item_id").eq("entry_date", entryDate),
  ]);
  if (oldAgeError) throw new Error(oldAgeError.message);
  if (existingError) throw new Error(existingError.message);

  const alreadyPulled = new Set((existingRows ?? []).map((r) => r.old_age_item_id).filter(Boolean));
  const toPull = (oldAgeItems ?? []).filter((item) => !alreadyPulled.has(item.id));
  if (toPull.length === 0) return [];

  const { data: maxPositionRows } = await supabase
    .from("qc_agenda_floor_aging")
    .select("position")
    .eq("entry_date", entryDate)
    .order("position", { ascending: false })
    .limit(1);
  let nextPosition = (maxPositionRows?.[0]?.position ?? 0) + 1;

  const rows = toPull.map((item) => ({
    entry_date: entryDate,
    position: nextPosition++,
    commodity_sku: item.description,
    lot_number: item.document,
    received_date: item.received_date,
    days_on_floor: item.age,
    action_needed: item.notes || (item.next_step ? NEXT_STEP_LABELS[item.next_step] : null),
    old_age_item_id: item.id,
    pack_style: item.pack_style,
    size: item.size,
  }));

  const { data, error } = await supabase.from("qc_agenda_floor_aging").insert(rows).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function addFloorAgingRow(entryDate: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qc_agenda_floor_aging")
    .insert({ entry_date: entryDate, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateFloorAgingRow(
  id: string,
  patch: {
    commodity_sku?: string | null;
    lot_number?: string | null;
    received_date?: string | null;
    days_on_floor?: number | null;
    action_needed?: string | null;
    pack_style?: string | null;
    size?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_floor_aging").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteFloorAgingRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_floor_aging").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Holdover Inspections (Not Checked) ---------------------------------------------

// Pull Holdovers looks at the prior business day's QC Inspections - for a
// Monday agenda that means both Saturday AND Sunday, since neither day has
// an agenda of its own to catch what was left unresolved over the weekend.
function holdoverLookbackDates(entryDate: string): string[] {
  const dayOfWeek = new Date(`${entryDate}T00:00:00Z`).getUTCDay(); // 0 = Sun ... 6 = Sat
  if (dayOfWeek === 1) return [addDays(entryDate, -2), addDays(entryDate, -1)];
  return [addDays(entryDate, -1)];
}

// Copies whatever QC Inspections rows from the lookback day(s) were never
// actually resolved - no result recorded, no Chat sent, no Report sent -
// into today's Holdovers list, skipping rows already pulled in for this
// date so re-clicking is safe. Same dedupe pattern as pullOldAgeIntoFloorAging.
export async function pullHoldoversFromInspections(entryDate: string) {
  const supabase = await createClient();
  const lookbackDates = holdoverLookbackDates(entryDate);

  const [{ data: inspections, error: inspectionsError }, { data: existingRows, error: existingError }] = await Promise.all([
    supabase
      .from("qc_inspections")
      .select("*")
      .in("entry_date", lookbackDates)
      .eq("chat", false)
      .eq("report", false)
      .order("entry_date", { ascending: true }),
    supabase.from("qc_agenda_holdovers").select("qc_inspection_id").eq("entry_date", entryDate),
  ]);
  if (inspectionsError) throw new Error(inspectionsError.message);
  if (existingError) throw new Error(existingError.message);

  const alreadyPulled = new Set((existingRows ?? []).map((r) => r.qc_inspection_id).filter(Boolean));
  const toPull = (inspections ?? []).filter(
    (item) => (!item.result || item.result.trim() === "") && !alreadyPulled.has(item.id),
  );
  if (toPull.length === 0) return [];

  const { data: maxPositionRows } = await supabase
    .from("qc_agenda_holdovers")
    .select("position")
    .eq("entry_date", entryDate)
    .order("position", { ascending: false })
    .limit(1);
  let nextPosition = (maxPositionRows?.[0]?.position ?? 0) + 1;

  const rows = toPull.map((item) => ({
    entry_date: entryDate,
    position: nextPosition++,
    inspection_date: item.entry_date,
    po: item.po,
    lot: item.lot,
    product: item.product,
    qc: item.qc,
    notes: item.notes,
    qc_inspection_id: item.id,
  }));

  const { data, error } = await supabase.from("qc_agenda_holdovers").insert(rows).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function addHoldoverRow(entryDate: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qc_agenda_holdovers")
    .insert({ entry_date: entryDate, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateHoldoverRow(
  id: string,
  patch: { po?: string | null; lot?: string | null; product?: string | null; qc?: string | null; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_holdovers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteHoldoverRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_holdovers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Repack Management & Supply Needs ------------------------------------------------

export async function addRepackRow(entryDate: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qc_agenda_repack")
    .insert({ entry_date: entryDate, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateRepackRow(
  id: string,
  patch: { reference?: string | null; pack_format?: string | null; priority?: string | null; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_repack").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteRepackRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_agenda_repack").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
