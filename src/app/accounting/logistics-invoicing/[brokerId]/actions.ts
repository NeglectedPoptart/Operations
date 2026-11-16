"use server";

import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { mergeInvoices } from "@/lib/invoiceImport";
import type { ParsedInvoiceRow } from "@/lib/invoicingParse";
import type { InvoiceStatement, InvoiceStatus } from "@/lib/types";

// unpdf wraps pdf.js specifically for serverless/edge runtimes - duplicated
// per-page rather than shared, matching every other page with a PDF upload.
export async function extractPdfText(formData: FormData): Promise<{ text: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { error: "No file received." };
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function revalidateAll(brokerId: string) {
  revalidatePath(`/accounting/logistics-invoicing/${brokerId}`);
  revalidatePath("/accounting/logistics-invoicing");
}

// Merge-only insert, matched on invoice_no within this broker - a row
// already present is left untouched. Same reasoning as PAS Files/Pending
// to Invoice: a broker's statement is a running list, re-pasting the full
// thing should only add what's new. (The merge itself is shared with the
// Freight Statements agent - see lib/invoiceImport.ts.)
export async function importInvoices(brokerId: string, rows: ParsedInvoiceRow[]) {
  const supabase = await createClient();
  const { inserted } = await mergeInvoices(supabase, brokerId, rows);
  if (inserted.length > 0) revalidateAll(brokerId);
  return inserted as unknown as InvoiceStatement[];
}

// "Last update" on the broker's Invoicing tile only tracks the two events
// that actually mean someone worked the account: marking an invoice Done,
// or adding a note - not every incidental field touch (e.g. re-marking
// Pending, dismissing a flag).
async function bumpBrokerActivity(supabase: Awaited<ReturnType<typeof createClient>>, brokerId: string) {
  const { error } = await supabase
    .from("brokers")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", brokerId);
  if (error) throw new Error(error.message);
}

export async function updateInvoiceStatement(
  id: string,
  brokerId: string,
  patch: Partial<Pick<InvoiceStatement, "status" | "notes" | "flagged">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_statements").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  if (patch.status === "done" || patch.notes !== undefined) {
    await bumpBrokerActivity(supabase, brokerId);
  }
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
