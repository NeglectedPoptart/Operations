"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { canEditLayouts } from "@/lib/roles";
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

// Saves the column widths for everyone (Admin / Supreme only; the database
// enforces it too).
export async function saveInspectionColumnWidths(widths: Record<string, number>): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!canEditLayouts((profile?.role as string | null) ?? null, user.email ?? null)) return { error: "Only an Admin can change the layout." };

  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(widths)) if (Number.isFinite(v)) clean[k] = Math.min(1200, Math.max(24, Math.round(v)));
  const { error } = await supabase
    .from("ui_layouts")
    .upsert({ key: "qc-inspections-columns", value: clean, updated_at: new Date().toISOString(), updated_by: user.email ?? null });
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function resetInspectionColumnWidths(): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { error } = await supabase.from("ui_layouts").delete().eq("key", "qc-inspections-columns");
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}
