"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedInvoiceRow } from "@/lib/invoicingParse";
import type { InvoiceStatement, InvoiceStatus } from "@/lib/types";

function revalidateAll(brokerId: string) {
  revalidatePath(`/logistics/invoicing/${brokerId}`);
  revalidatePath("/logistics/invoicing");
}

function matchKey(invoiceNo: string): string {
  return invoiceNo.trim().toLowerCase();
}

// Merge-only insert, matched on invoice_no within this broker - a row
// already present is left untouched. Same reasoning as PAS Files/Pending
// to Invoice: a broker's statement is a running list, re-pasting the full
// thing should only add what's new.
export async function importInvoices(brokerId: string, rows: ParsedInvoiceRow[]) {
  const supabase = await createClient();
  if (rows.length === 0) return [];

  const { data: existing, error: existingError } = await supabase
    .from("invoice_statements")
    .select("invoice_no")
    .eq("broker_id", brokerId);
  if (existingError) throw new Error(existingError.message);

  const existingKeys = new Set((existing ?? []).map((r) => matchKey(r.invoice_no)));
  const seenInBatch = new Set<string>();
  const toInsert = [];
  for (const row of rows) {
    const key = matchKey(row.invoice_no);
    if (existingKeys.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    toInsert.push({ ...row, broker_id: brokerId });
  }

  if (toInsert.length === 0) return [];

  const { data, error } = await supabase.from("invoice_statements").insert(toInsert).select();
  if (error) throw new Error(error.message);
  revalidateAll(brokerId);
  return data;
}

export async function updateInvoiceStatement(
  id: string,
  brokerId: string,
  patch: Partial<Pick<InvoiceStatement, "status" | "notes" | "flagged">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_statements").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll(brokerId);
}

export async function setInvoiceStatus(id: string, brokerId: string, status: InvoiceStatus | null) {
  return updateInvoiceStatement(id, brokerId, { status });
}

export async function deleteInvoiceStatement(id: string, brokerId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_statements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll(brokerId);
}
