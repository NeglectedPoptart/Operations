"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { OLD_AGE_NEXT_STEPS } from "@/lib/types";
import type { QcInboundStatus } from "@/lib/types";

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

// Floor Aging Check --------------------------------------------------------------

const NEXT_STEP_LABELS = Object.fromEntries(OLD_AGE_NEXT_STEPS.map((s) => [s.value, s.label]));

// Copies whatever is currently in Old Age into today's Floor Aging Check
// list, skipping items already pulled in for this date so re-clicking is
// safe. The user prunes down what's not relevant with the row delete button.
export async function pullOldAgeIntoFloorAging(entryDate: string) {
  const supabase = await createClient();

  const [{ data: oldAgeItems, error: oldAgeError }, { data: existingRows, error: existingError }] = await Promise.all([
    supabase.from("old_age_items").select("*").order("position", { ascending: true }),
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
