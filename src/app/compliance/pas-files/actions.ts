"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedPasFileRow } from "@/lib/pasFilesParse";
import type { PasFile } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/compliance/pas-files");
}

function matchKey(orderNo: string, po: string): string {
  return `${orderNo.trim().toLowerCase()}|${po.trim().toLowerCase()}`;
}

// Merge-only import: a row already present (matched on order_no + po) is
// left completely untouched. Only rows that aren't already in the list get
// inserted - this is a running sheet, not a wholesale-replace like Old Age.
export async function importPasFiles(rows: ParsedPasFileRow[]) {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase.from("pas_files").select("order_no, po, position");
  if (existingError) throw new Error(existingError.message);

  const existingKeys = new Set((existing ?? []).map((r) => matchKey(r.order_no, r.po ?? "")));
  let nextPosition = (existing ?? []).reduce((max, r) => Math.max(max, r.position), 0) + 1;

  const seenInBatch = new Set<string>();
  const toInsert: (ParsedPasFileRow & { position: number })[] = [];
  for (const row of rows) {
    const key = matchKey(row.order_no, row.po);
    if (existingKeys.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    toInsert.push({ ...row, position: nextPosition++ });
  }

  if (toInsert.length === 0) return [];

  const { data, error } = await supabase.from("pas_files").insert(toInsert).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function addPasFileRow(nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pas_files")
    .insert({ position: nextPosition, order_no: "" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updatePasFileRow(id: string, patch: Partial<Omit<PasFile, "id" | "created_at" | "updated_at">>) {
  const supabase = await createClient();
  const { error } = await supabase.from("pas_files").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deletePasFileRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pas_files").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
