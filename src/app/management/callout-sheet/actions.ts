"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CalloutApproved } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/management/callout-sheet");
}

export interface CalloutEntryInput {
  employee_name: string;
  entry_date: string;
  call_out_type: string;
  reason: string | null;
  notified_at: string | null;
  approved: CalloutApproved | null;
  return_date: string | null;
}

export async function createCalloutEntry(input: CalloutEntryInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("callout_entries").insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateCalloutEntry(id: string, patch: Partial<CalloutEntryInput>) {
  const supabase = await createClient();
  const { error } = await supabase.from("callout_entries").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteCalloutEntry(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("callout_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Locked-list additions (same fire-and-forget pattern as createHub /
// createDestinationCity - duplicates are harmless no-ops).
export async function createEmployee(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({ name: trimmed });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidateAll();
}

export async function createCalloutType(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase.from("callout_types").insert({ name: trimmed });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidateAll();
}
