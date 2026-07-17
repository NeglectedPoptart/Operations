"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPasRow, type ParsedPasFileRow } from "@/lib/pasFilesParse";
import type { PasFile } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function revalidateAll() {
  revalidatePath("/compliance/pas-files");
  revalidatePath("/sales/pending-to-invoice");
}

function matchKey(orderNo: string, po: string): string {
  return `${orderNo.trim().toLowerCase()}|${po.trim().toLowerCase()}`;
}

// Merge-only insert into the given table: a row already present (matched on
// order_no + po) is left completely untouched. Only rows that aren't
// already there get inserted - both pas_files and pending_to_invoice are
// running lists, not wholesale-replace like Old Age.
async function mergeInsert(supabase: SupabaseClient, table: "pas_files" | "pending_to_invoice", rows: ParsedPasFileRow[]) {
  if (rows.length === 0) return [];

  const { data: existing, error: existingError } = await supabase.from(table).select("order_no, po, position");
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

  const { data, error } = await supabase.from(table).insert(toInsert).select();
  if (error) throw new Error(error.message);
  return data;
}

// Splits the full pasted pending-to-invoice export in two: rows marked PAS
// (on PO or Order Type) go to PAS Files, everything else goes to Sales ->
// Pending to Invoice. Each destination merges independently, same as the
// original PAS Files-only import.
export async function importPendingList(rows: ParsedPasFileRow[]) {
  const supabase = await createClient();
  const pasRows = rows.filter(isPasRow);
  const invoiceRows = rows.filter((r) => !isPasRow(r));

  const [pasFiles, pendingToInvoice] = await Promise.all([
    mergeInsert(supabase, "pas_files", pasRows),
    mergeInsert(supabase, "pending_to_invoice", invoiceRows),
  ]);

  revalidateAll();
  return { pasFiles, pendingToInvoice };
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
