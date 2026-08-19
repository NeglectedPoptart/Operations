"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedApPayable } from "@/lib/apReportParse";
import type { ApPayable, ApVendor } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/accounting/ap");
  revalidatePath("/");
}

// Syncs the open-payables list against a fresh Accrued Payables pull: a
// payable already here (matched on vendor + document + concept - a
// document number alone isn't unique, since one document can carry
// multiple lines like "Customs" and "Freight") has its
// balance/date/type/GL account refreshed, but keeps whatever collections
// follow-up (last_contact/notes/highlight) was already on it. One missing
// from the new import (paid off) is deleted. A new one is inserted. Same
// sync policy as the AR page's importArReport, just keyed on this
// three-part composite instead of a single invoice number.
export async function importApReport(
  rows: ParsedApPayable[],
): Promise<{ vendors: ApVendor[]; payables: ApPayable[] }> {
  const supabase = await createClient();

  const vendorByCode = new Map<string, { vendor_code: string; vendor_name: string }>();
  for (const row of rows) {
    vendorByCode.set(row.vendorCode, { vendor_code: row.vendorCode, vendor_name: row.vendorName });
  }
  const { error: vendorError } = await supabase
    .from("ap_vendors")
    .upsert(Array.from(vendorByCode.values()), { onConflict: "vendor_code" });
  if (vendorError) throw new Error(vendorError.message);

  const { data: vendors, error: vendorsFetchError } = await supabase.from("ap_vendors").select("*");
  if (vendorsFetchError) throw new Error(vendorsFetchError.message);
  const vendorIdByCode = new Map((vendors ?? []).map((v) => [v.vendor_code, v.id]));

  const { data: existing, error: existingError } = await supabase
    .from("ap_payables")
    .select("id, vendor_id, document, concept, position");
  if (existingError) throw new Error(existingError.message);

  const rowKey = (vendorId: string | undefined, document: string, concept: string | null) =>
    `${vendorId}:${document}:${concept ?? ""}`;

  const existingByKey = new Map((existing ?? []).map((r) => [rowKey(r.vendor_id, r.document, r.concept), r]));
  const importedKeys = new Set(
    rows.map((r) => rowKey(vendorIdByCode.get(r.vendorCode), r.document, r.concept || null)),
  );

  // Anything open before that isn't in this pull has been paid off.
  const toRemove = (existing ?? [])
    .filter((r) => !importedKeys.has(rowKey(r.vendor_id, r.document, r.concept)))
    .map((r) => r.id);
  // Chunked so a large one-time removal (e.g. excluding a whole GL account
  // that was previously synced by mistake) doesn't build an .in() filter
  // long enough to blow past request URL length limits.
  const REMOVE_CHUNK_SIZE = 200;
  for (let i = 0; i < toRemove.length; i += REMOVE_CHUNK_SIZE) {
    const chunk = toRemove.slice(i, i + REMOVE_CHUNK_SIZE);
    const { error: deleteError } = await supabase.from("ap_payables").delete().in("id", chunk);
    if (deleteError) throw new Error(deleteError.message);
  }

  let nextPosition = (existing ?? []).reduce((max, r) => Math.max(max, r.position), 0) + 1;
  const newRows: Record<string, unknown>[] = [];
  const updateRows: Record<string, unknown>[] = [];

  for (const row of rows) {
    const vendorId = vendorIdByCode.get(row.vendorCode);
    if (!vendorId) continue; // shouldn't happen - every row's vendor was just upserted above
    const existingRow = existingByKey.get(rowKey(vendorId, row.document, row.concept || null));

    // Only balance/date/type/concept/GL account are refreshed here -
    // last_contact/notes/highlight are left untouched by omitting them
    // entirely.
    const base = {
      vendor_id: vendorId,
      document: row.document,
      gl_account_code: row.glAccountCode,
      gl_account_label: row.glAccountLabel,
      doc_date: row.docDate,
      type: row.type || null,
      concept: row.concept || null,
      balance: row.balance,
    };
    if (existingRow) {
      updateRows.push({ id: existingRow.id, ...base });
    } else {
      newRows.push({ ...base, position: nextPosition++ });
    }
  }

  if (newRows.length > 0) {
    const { error } = await supabase.from("ap_payables").insert(newRows);
    if (error) throw new Error(error.message);
  }
  if (updateRows.length > 0) {
    const { error } = await supabase.from("ap_payables").upsert(updateRows);
    if (error) throw new Error(error.message);
  }

  const { data: finalPayables, error: finalError } = await supabase.from("ap_payables").select("*");
  if (finalError) throw new Error(finalError.message);
  const { data: finalVendors, error: finalVendorsError } = await supabase.from("ap_vendors").select("*");
  if (finalVendorsError) throw new Error(finalVendorsError.message);

  revalidateAll();
  return { vendors: (finalVendors ?? []) as ApVendor[], payables: (finalPayables ?? []) as ApPayable[] };
}

export async function updateApPayableRow(
  id: string,
  patch: Partial<Pick<ApPayable, "last_contact" | "notes" | "highlight">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("ap_payables").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteApPayableRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("ap_payables").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
