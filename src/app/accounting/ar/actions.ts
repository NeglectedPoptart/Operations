"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedArInvoice } from "@/lib/arReportParse";
import type { ArCustomer, ArInvoice } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/accounting/ar");
  revalidatePath("/");
}

// Syncs the open-invoice list against a fresh AR Aging pull: an invoice
// already here (matched on invoice_no) has its balance/dates/flags/customer
// refreshed, but keeps whatever collections follow-up (last_contact/notes/
// highlight) was already on it. One missing from the new import (paid off
// or closed) is deleted. A new one is inserted.
export async function importArReport(rows: ParsedArInvoice[]): Promise<{ customers: ArCustomer[]; invoices: ArInvoice[] }> {
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
  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase.from("ar_invoices").delete().in("id", toRemove);
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
  const { data: finalCustomers, error: finalCustomersError } = await supabase.from("ar_customers").select("*");
  if (finalCustomersError) throw new Error(finalCustomersError.message);

  revalidateAll();
  return { customers: (finalCustomers ?? []) as ArCustomer[], invoices: (finalInvoices ?? []) as ArInvoice[] };
}

export async function updateArInvoiceRow(
  id: string,
  patch: Partial<Pick<ArInvoice, "last_contact" | "notes" | "highlight">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("ar_invoices").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteArInvoiceRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("ar_invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
