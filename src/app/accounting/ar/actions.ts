"use server";

import { revalidatePath } from "next/cache";
// unpdf wraps pdf.js specifically for serverless/edge runtimes (avoids a
// worker-file path Vercel's bundler can't resolve at runtime) - same
// extraction used by every other PDF-upload page in this app, each keeping
// its own copy in its own actions.ts.
import { extractText, getDocumentProxy } from "unpdf";
import { computeArSummaryTotals } from "@/lib/arShared";
import { logActivity } from "@/lib/auditLog";
import { createClient } from "@/lib/supabase/server";
import type { ParsedArInvoice } from "@/lib/arReportParse";
import type { ArCustomer, ArInvoice, ArSummarySnapshot } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/accounting/ar");
  revalidatePath("/");
}

export async function extractPdfText(formData: FormData): Promise<{ text: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { error: "No file received." };

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: Array.isArray(text) ? text.join("\n") : text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Syncs the open-invoice list against a fresh AR Aging pull: an invoice
// already here (matched on invoice_no) has its balance/dates/flags/customer
// refreshed, but keeps whatever collections follow-up (last_contact/notes/
// highlight) was already on it. One missing from the new import (paid off
// or closed) is deleted. A new one is inserted.
export async function importArReport(
  rows: ParsedArInvoice[],
): Promise<{ customers: ArCustomer[]; invoices: ArInvoice[] }> {
  const supabase = await createClient();

  const customerByCode = new Map<
    string,
    { customer_code: string; customer_name: string; credit_limit: number | null; bb_rating: string | null }
  >();
  for (const row of rows) {
    customerByCode.set(row.customerCode, {
      customer_code: row.customerCode,
      customer_name: row.customerName,
      credit_limit: row.creditLimit,
      bb_rating: row.bbRating,
    });
  }
  const { error: customerError } = await supabase
    .from("ar_customers")
    .upsert(Array.from(customerByCode.values()), { onConflict: "customer_code" });
  if (customerError) throw new Error(customerError.message);

  const { data: customers, error: customersFetchError } = await supabase.from("ar_customers").select("*");
  if (customersFetchError) throw new Error(customersFetchError.message);
  const customerIdByCode = new Map((customers ?? []).map((c) => [c.customer_code, c.id]));

  const { data: existing, error: existingError } = await supabase.from("ar_invoices").select("id, invoice_no, position");
  if (existingError) throw new Error(existingError.message);

  const existingByInvoiceNo = new Map((existing ?? []).map((r) => [r.invoice_no, r]));
  const importedInvoiceNos = new Set(rows.map((r) => r.invoiceNo));

  // Anything open before that isn't in this pull has been paid off/closed.
  const toRemove = (existing ?? []).filter((r) => !importedInvoiceNos.has(r.invoice_no)).map((r) => r.id);
  // Chunked so a large one-time removal doesn't build an .in() filter long
  // enough to blow past request URL length limits.
  const REMOVE_CHUNK_SIZE = 200;
  for (let i = 0; i < toRemove.length; i += REMOVE_CHUNK_SIZE) {
    const chunk = toRemove.slice(i, i + REMOVE_CHUNK_SIZE);
    const { error: deleteError } = await supabase.from("ar_invoices").delete().in("id", chunk);
    if (deleteError) throw new Error(deleteError.message);
  }

  let nextPosition = (existing ?? []).reduce((max, r) => Math.max(max, r.position), 0) + 1;
  const newRows: Record<string, unknown>[] = [];
  const updateRows: Record<string, unknown>[] = [];

  for (const row of rows) {
    const existingRow = existingByInvoiceNo.get(row.invoiceNo);
    const customerId = customerIdByCode.get(row.customerCode);
    if (!customerId) continue; // shouldn't happen - every row's customer was just upserted above

    // Only balance/dates/flags/customer are refreshed here - last_contact/
    // notes/highlight are left untouched by omitting them entirely.
    const base = {
      customer_id: customerId,
      invoice_no: row.invoiceNo,
      po: row.po,
      invoice_date: row.invoiceDate,
      due_date: row.dueDate,
      doc_amount: row.docAmount,
      balance: row.balance,
      has_partial_credit: row.hasPartialCredit,
      trouble_status: row.troubleStatus,
    };
    if (existingRow) {
      updateRows.push({ id: existingRow.id, ...base });
    } else {
      newRows.push({ ...base, position: nextPosition++ });
    }
  }

  if (newRows.length > 0) {
    const { error } = await supabase.from("ar_invoices").insert(newRows);
    if (error) throw new Error(error.message);
  }
  if (updateRows.length > 0) {
    const { error } = await supabase.from("ar_invoices").upsert(updateRows);
    if (error) throw new Error(error.message);
  }

  const { data: finalInvoices, error: finalError } = await supabase.from("ar_invoices").select("*");
  if (finalError) throw new Error(finalError.message);
  const { data: customersAfterImport, error: finalCustomersError } = await supabase.from("ar_customers").select("*");
  if (finalCustomersError) throw new Error(finalCustomersError.message);
  let finalCustomers = customersAfterImport;

  // Sweeps up nameless customers left behind by an earlier parser bug that
  // mistook the report's "run by" username for a customer. Only removed once
  // they own no invoices (the import above moves every invoice back to its
  // real customer first) - ar_invoices cascades on customer delete, so this
  // must never touch a customer that still has any.
  const customerIdsWithInvoices = new Set((finalInvoices ?? []).map((i) => i.customer_id as string));
  const strayIds = (finalCustomers ?? [])
    .filter((c) => !(c.customer_name as string | null)?.trim() && !customerIdsWithInvoices.has(c.id as string))
    .map((c) => c.id as string);
  if (strayIds.length > 0) {
    const { error: strayError } = await supabase.from("ar_customers").delete().in("id", strayIds);
    if (strayError) throw new Error(strayError.message);
    finalCustomers = (finalCustomers ?? []).filter((c) => !strayIds.includes(c.id as string));
  }

  await logActivity(
    "ar_upload",
    `Uploaded AR report: ${rows.length} invoices (${newRows.length} new, ${updateRows.length} updated, ${toRemove.length} removed)`,
    { invoices: rows.length, added: newRows.length, updated: updateRows.length, removed: toRemove.length },
  );

  revalidateAll();
  return { customers: (finalCustomers ?? []) as ArCustomer[], invoices: (finalInvoices ?? []) as ArInvoice[] };
}

// Manually-set comparison checkpoint for "Show Changes" - deliberately not
// touched by importArReport above. A snapshot taken automatically on every
// sync only ever showed the diff for one moment (right after that sync,
// before it got overwritten by the same sync) and disappeared for good on
// the next page load or sync, which wasn't legible as a persistent feature.
// This only moves when someone explicitly resets it, so the comparison
// stays available and meaningful until they choose to start over.
export async function saveArBaseline(): Promise<ArSummarySnapshot> {
  const supabase = await createClient();

  const { data: invoices, error: invoicesError } = await supabase.from("ar_invoices").select("*");
  if (invoicesError) throw new Error(invoicesError.message);
  const totals = computeArSummaryTotals((invoices ?? []) as ArInvoice[]);

  const { error: deleteError } = await supabase.from("ar_summary_snapshot").delete().not("id", "is", null);
  if (deleteError) throw new Error(deleteError.message);
  const { data: row, error: insertError } = await supabase
    .from("ar_summary_snapshot")
    .insert({
      total: totals.total,
      customers: totals.customers,
      escalated: totals.escalated,
      needs_contact: totals.needsContact,
      trouble_claims: totals.troubleClaims,
      short_total: totals.shortTotal,
      over_total: totals.overTotal,
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);

  await logActivity("ar_change", "Reset the AR comparison baseline");

  revalidateAll();
  return row as ArSummarySnapshot;
}

// Describes which invoice an edit touched, for the activity log. Best-effort -
// a lookup failure just yields a vaguer line rather than blocking the edit.
async function describeInvoice(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("ar_invoices")
    .select("invoice_no, last_contact, notes, highlight, ar_customers(customer_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const customer = (data.ar_customers as unknown as { customer_name: string } | null)?.customer_name ?? "?";
  return { label: `${data.invoice_no} (${customer})`, before: data as Record<string, unknown> };
}

export async function updateArInvoiceRow(
  id: string,
  patch: Partial<Pick<ArInvoice, "last_contact" | "notes" | "highlight">>,
) {
  const supabase = await createClient();
  const info = await describeInvoice(supabase, id);
  const { error } = await supabase.from("ar_invoices").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  const changes = Object.entries(patch)
    .filter(([key, value]) => (info?.before[key] ?? null) !== (value === "" ? null : value))
    .map(([key, value]) => ({ field: key, from: info?.before[key] ?? null, to: value }));
  if (changes.length > 0) {
    await logActivity(
      "ar_change",
      `Invoice ${info?.label ?? id}: ${changes.map((c) => `${c.field} "${c.from ?? ""}" -> "${c.to ?? ""}"`).join("; ")}`,
      { invoice_id: id, changes },
    );
  }
  revalidateAll();
}

export async function deleteArInvoiceRow(id: string) {
  const supabase = await createClient();
  const info = await describeInvoice(supabase, id);
  const { error } = await supabase.from("ar_invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity("ar_change", `Removed invoice ${info?.label ?? id}`, { invoice_id: id });
  revalidateAll();
}

// Called once when someone opens the AR page (from the client, since a
// server render also fires on every background refresh).
export async function logArOpened() {
  await logActivity("ar_open", "Opened Accounts Receivable");
}
