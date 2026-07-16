"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { ParsedQcInspectionRow } from "@/lib/qcInspectionsParse";
import type { QcInspection } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/qc/inspections");
}

// Append-only: there's no reliable natural key to merge on (PO/Lot are often
// blank), so every paste just adds new rows after whatever's already there -
// this matches how the sheet itself grows, a few new rows added per day.
export async function importQcInspections(rows: ParsedQcInspectionRow[]) {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("qc_inspections")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  if (existingError) throw new Error(existingError.message);

  let nextPosition = (existing?.[0]?.position ?? 0) + 1;
  const toInsert = rows.map((row) => ({ ...row, position: nextPosition++ }));

  const { data, error } = await supabase.from("qc_inspections").insert(toInsert).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function addQcInspectionRow(nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qc_inspections")
    .insert({ position: nextPosition, entry_date: todayISO() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateQcInspectionRow(id: string, patch: Partial<Omit<QcInspection, "id" | "created_at" | "updated_at">>) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_inspections").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteQcInspectionRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_inspections").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
