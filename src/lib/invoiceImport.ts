import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedInvoiceRow } from "./invoicingParse";

// Merge-only insert into a carrier's invoice list (Accounting > Logistics Invoicing), matched on invoice number
// within that carrier - a row already present is left untouched. A carrier's statement is a running list, so
// loading the full thing again only adds what's new. Used by the Invoicing page and the Freight Statements agent.
export function invoiceMatchKey(invoiceNo: string): string {
  return invoiceNo.trim().toLowerCase();
}

export async function mergeInvoices(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  brokerId: string,
  rows: ParsedInvoiceRow[],
): Promise<{ inserted: Record<string, unknown>[]; alreadyOnList: number }> {
  if (rows.length === 0) return { inserted: [], alreadyOnList: 0 };

  // Page through - Supabase returns at most 1,000 rows per request.
  const existingKeys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("invoice_statements").select("invoice_no").eq("broker_id", brokerId).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) existingKeys.add(invoiceMatchKey(String(r.invoice_no)));
    if ((data ?? []).length < 1000) break;
  }

  const seenInBatch = new Set<string>();
  const toInsert: (ParsedInvoiceRow & { broker_id: string })[] = [];
  let alreadyOnList = 0;
  for (const row of rows) {
    const key = invoiceMatchKey(row.invoice_no);
    if (existingKeys.has(key) || seenInBatch.has(key)) {
      alreadyOnList++;
      continue;
    }
    seenInBatch.add(key);
    toInsert.push({ ...row, broker_id: brokerId });
  }
  if (toInsert.length === 0) return { inserted: [], alreadyOnList };

  const { data, error } = await supabase.from("invoice_statements").insert(toInsert).select();
  if (error) throw new Error(error.message);
  return { inserted: (data ?? []) as Record<string, unknown>[], alreadyOnList };
}
