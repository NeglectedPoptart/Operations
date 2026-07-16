"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { QcInspection } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/qc/inspections");
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
